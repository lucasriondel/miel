/**
 * `Claude` — one `run(task, input)` over the task table (`./tasks`), reaching
 * the model either through the `claude` CLI in print mode, with a long-lived
 * Claude Code token injected into the subprocess env so it never needs an
 * interactive login, or through a hosted vendor over HTTP. That token comes
 * from one place only — the row the operator pasted in Settings
 * (`services/claudeCodeToken`, #109); the environment is not consulted.
 *
 * The one hosted-vs-CLI branch lives here (#105, #128). The CLI transport is
 * `effect-ai-claude-code` — an `effect/ai` `LanguageModel` over `claude -p`,
 * faked in tests at the process spawner — and the hosted one is `./hosted`,
 * the Vercel ai-sdk behind one substitutable function. Both are reached from
 * `runTask` below, after `resolveTaskProviderEffect` (#125) has said which
 * provider and model the task runs on — so a task pointed at a hosted vendor
 * with no stored key fails as `ProviderNotRunnableError` before a socket is
 * opened, and the vendor's key is read through the one decryptor and handed
 * over `Redacted`, unwrapped only at the call that spends it.
 *
 * What is a miel decision stays visible here: the token's source, the auth
 * heuristic below, and the mapping of both transports' failures onto miel's
 * own error taxonomy (`errors.ts`), whose tags the API's error middleware and
 * the sync socket both key on.
 */
import { BunServices } from "@effect/platform-bun";
import { Context, Duration, Effect, Layer, Redacted } from "effect";
import type { AiError } from "effect/ai";
import { LanguageModel } from "effect/ai";
import type { ChildProcessSpawner } from "effect/process";
import { ClaudeCodeClient, ClaudeCodeLanguageModel } from "effect-ai-claude-code";
import { isCredentialProvider } from "../credentialProviders";
import { getEnv } from "../env";
import {
  ClaudeAuthError,
  ClaudeParseError,
  ClaudeSchemaError,
  ClaudeSpawnError,
  ClaudeTimeoutError,
  ClaudeTokenMissingError,
  ProviderNotRunnableError,
  type ClaudeError,
} from "../errors";
import type { UnknownSettingError } from "../services/settings";
import { createDebug } from "../util/debug";
import { claudeTaskSpec, type ClaudeTaskInput, type ClaudeTaskOutput } from "./tasks";
import { generateHostedLive, runHosted, type HostedGenerate } from "./hosted";
// Imported from the service modules, not the barrel: the plaintext readers are
// not part of core's public surface (#109, ADR-0001).
import { readClaudeCodeTokenEffect } from "../services/claudeCodeToken";
import { readProviderCredentialEffect } from "../services/encryptedSecrets";
import type { ModelTask } from "../providerModels";
import type { Stores } from "../stores/contracts";
import { resolveTaskProviderEffect } from "../services/taskProviders";

const debug = createDebug("claude");

export interface ClaudeRunResult<T> {
  output: T;
  runId: string;
  model: string;
}

/**
 * Which process spawner the CLI transport launches `claude` through.
 *
 * Production is Bun's, and there is no other caller in the shipped code. It is
 * a function rather than a constant so a suite can substitute
 * `ClaudeCodeTest.make` — the deep fake that answers with a canned capture,
 * leaving the real arg assembly, envelope parse and error mapping to run.
 */
let spawnerLayer: () => Layer.Layer<ChildProcessSpawner.ChildProcessSpawner> = () =>
  BunServices.layer;

/**
 * Substitute the spawner layer; `null` restores Bun's. Test-only — named like
 * the repo's other `_*ForTests` hooks and exempted from the underscore lint
 * rule for the same reason.
 */
export function _setSpawnerLayerForTests(
  layer: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner> | null,
): void {
  spawnerLayer = layer === null ? () => BunServices.layer : () => layer;
}

/**
 * The hosted transport's one HTTP call, substitutable the same way — so the
 * hosted path is exercised with the real credential read and error mapping,
 * and no vendor is ever called.
 */
let hostedGenerateForTests: HostedGenerate | null = null;

export function _setHostedGenerateForTests(fn: HostedGenerate | null): void {
  hostedGenerateForTests = fn;
}

/**
 * Heuristic: does the CLI output look like an auth/token problem?
 *
 * This stays miel's rather than the provider's on purpose. The distinction it
 * draws is miel's alone: `ClaudeAuthError` is a member of
 * `ProviderUnavailableError` (#126), so a token the CLI rejected stops the
 * whole sync run with one toast, while any other non-zero exit is this batch's
 * problem and the run continues. The provider reports the same condition
 * structurally — a non-zero exit with no envelope — because it cannot know
 * which of those two a consumer considers it. Keeping the guess here also
 * keeps it visible: it is a regex over CLI wording, and CLI wording changes.
 */
function looksLikeAuthProblem(s: string): boolean {
  return /not logged in|please run \/login|unauthorized|invalid api key|invalid token|authentication/i.test(
    s,
  );
}

/** The provider's own detail for a failure, where it recorded one. */
const cliDetail = (reason: AiError.AiErrorReason): Record<string, unknown> =>
  (("metadata" in reason && (reason.metadata as Record<string, unknown>)["claude-code"]) ||
    {}) as Record<string, unknown>;

/**
 * The provider's taxonomy is structural; miel's says what a failure *means*
 * here, which is what every boundary above keys on. Every `AiError` carries a
 * `reason`, and that reason is what is mapped.
 */
const fromAiError = (error: AiError.AiError): ClaudeError => {
  const reason = error.reason;
  const detail = cliDetail(reason);
  const description = "description" in reason ? (reason.description ?? "") : "";
  const stderr = typeof detail.stderr === "string" ? detail.stderr : "";
  const text = `${description}\n${stderr}`;
  switch (reason._tag) {
    // The CLI said so itself: a 401/403 from the API, or "Not logged in" on the
    // assistant line.
    case "AuthenticationError":
      return new ClaudeAuthError({ detail: text.trim().slice(0, 500) });
    // A valid envelope whose `structured_output` the Schema refused, or none at
    // all — the model broke its output contract.
    case "StructuredOutputError":
      return new ClaudeSchemaError({
        issue: reason.description,
        raw: reason.responseText.slice(0, 2000),
      });
    // A stdout line that is not an envelope.
    case "InvalidOutputError":
      return new ClaudeParseError({
        stage: "envelope",
        raw: typeof detail.line === "string" ? detail.line : reason.description,
      });
    case "InternalProviderError":
      // The provider reports both timeouts as this retryable reason, with
      // which one it was in the detail.
      if (typeof detail.timeoutMs === "number") {
        return new ClaudeTimeoutError({ timeoutMs: detail.timeoutMs });
      }
      break;
    default:
      break;
  }
  // Everything else — the child never launched, exit ≠ 0 with no envelope, an
  // API error the CLI relayed, a rate limit — is one run's problem, unless the
  // wording says the install's token is what is wrong.
  return looksLikeAuthProblem(text)
    ? new ClaudeAuthError({ detail: text.trim().slice(0, 500) })
    : new ClaudeSpawnError({
        cause: { reason: reason._tag, description, ...detail },
      });
};

// ── Service ──────────────────────────────────────────────────────────────────

/**
 * The whole service: one call, taking the task and that task's input.
 *
 * This is the only injection seam for the Claude dependency (#133). There used
 * to be two — this tag, and a wrapper service in sync whose one production
 * adapter re-wrapped a promise facade over this very tag — so a fake could be
 * handed in at either end and the suites disagreed about which. Everything that
 * needs a model now depends on `Claude`, and a fake is a `ClaudeImpl` provided
 * through a layer.
 *
 * `run` carries no requirement of its own, which is what makes it usable as a
 * seam: a caller states `Claude` and nothing else. The stores the real
 * implementation needs — the task's provider and model from settings, its
 * credential from the secret store (#132) — ride in {@link ClaudeLive}'s `R`
 * instead, so production still cannot build it without providing them, and a
 * fake still needs nothing at all.
 */
export interface ClaudeImpl {
  readonly run: <K extends ModelTask>(
    task: K,
    input: ClaudeTaskInput<K>,
  ) => Effect.Effect<ClaudeRunResult<ClaudeTaskOutput<K>>, ClaudeError | UnknownSettingError>;
}

export class Claude extends Context.Service<Claude, ClaudeImpl>()("Claude") {}

/**
 * The CLI transport: `claude -p` through `effect-ai-claude-code`, constrained
 * with the task's Schema (`--json-schema`) and allowed the task's tools.
 */
const runCli = <K extends ModelTask>(
  task: K,
  input: ClaudeTaskInput<K>,
  model: string,
  token: string,
): Effect.Effect<ClaudeRunResult<ClaudeTaskOutput<K>>, ClaudeError> => {
  const spec = claudeTaskSpec(task);
  const { CLAUDE_BIN } = getEnv();
  const client = ClaudeCodeClient.layer({
    auth: { oauthToken: Redacted.make(token) },
    binPath: CLAUDE_BIN,
    // The whole-call budget the subprocess always had. The idle bound is set
    // to the same value on purpose: the provider's default of two minutes
    // between envelopes would cut a triage run short while the model is quiet
    // inside a Bash tool call, which the old transport never did.
    totalTimeout: Duration.minutes(10),
    idleTimeout: Duration.minutes(10),
  });
  const languageModel = ClaudeCodeLanguageModel.layer({
    model,
    config: {
      // The flag is emitted only when the row lists a tool; an empty list is
      // "nothing to reach for", not an empty `--allowedTools`.
      allowedTools: spec.allowedTools.length > 0 ? spec.allowedTools : undefined,
    },
  });
  return LanguageModel.generateObject({
    prompt: spec.cliPrompt(input),
    schema: spec.output,
  }).pipe(
    Effect.provide(languageModel),
    Effect.provide(client),
    Effect.provide(spawnerLayer()),
    Effect.mapError(fromAiError),
    Effect.map((response) => {
      // The CLI's real session id and the model it resolved the alias to, off
      // the response's metadata part.
      const metadata = response.content.find((part) => part.type === "response-metadata");
      return {
        output: response.value,
        runId: metadata?.id ?? "",
        model: metadata?.modelId ?? model,
      };
    }),
  );
};

const runTask = <K extends ModelTask>(
  task: K,
  input: ClaudeTaskInput<K>,
): Effect.Effect<ClaudeRunResult<ClaudeTaskOutput<K>>, ClaudeError | UnknownSettingError, Stores> =>
  Effect.gen(function* () {
    debug("run", { task });
    const spec = claudeTaskSpec(task);
    const { provider, model } = yield* resolveTaskProviderEffect(task);

    if (isCredentialProvider(provider)) {
      // The resolver checked that a key exists; reading it is the race guard
      // for a key deleted (or unreadable) between the check and now, and the
      // same refusal so a boundary cannot tell the two apart (#125).
      const apiKey = yield* readProviderCredentialEffect(provider).pipe(
        Effect.catch(() => Effect.succeed(null)),
      );
      if (!apiKey) {
        return yield* new ProviderNotRunnableError({
          task,
          provider,
          reason: "missing_provider_credential",
          phase: "run",
        });
      }
      const result = yield* runHosted({
        vendor: provider,
        modelId: model,
        // The task's hosted prompt, never its CLI one: no tools over there, and
        // the CLI column is the one allowed to carry secrets.
        system: spec.hostedPrompt(input),
        instruction: spec.hostedInstruction,
        output: spec.output,
        apiKey: Redacted.make(apiKey),
        generate: hostedGenerateForTests ?? generateHostedLive,
      });
      debug("run done", { task, model: result.model, runId: result.runId });
      return result;
    }

    // The stored token, and nothing else (#109) — read per call, so a token
    // pasted in Settings takes effect on the next run with no restart, and a
    // missing row fails before any subprocess exists.
    const token = yield* readClaudeCodeTokenEffect();
    if (!token) return yield* new ClaudeTokenMissingError();
    const result = yield* runCli(task, input, model, token);
    debug("run done", { task, model: result.model, runId: result.runId });
    return result;
  });

/**
 * The live implementation, holding the store context it was built with. That
 * capture is the whole reason this is `Layer.effect` and not `Layer.succeed`:
 * it moves the store requirement off every call site and onto whoever provides
 * the layer, which is already the boundary that provides `StoresLive`.
 */
export const ClaudeLive = Layer.effect(
  Claude,
  Effect.map(Effect.context<Stores>(), (stores): ClaudeImpl => ({
    run: (task, input) => Effect.provideContext(runTask(task, input), stores),
  })),
);
