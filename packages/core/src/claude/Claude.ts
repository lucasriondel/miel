/**
 * `Claude` — one `run(task, input)` over the task table (`./tasks`), reaching
 * the model either through the `claude` CLI in print mode
 * (`claude -p --output-format=json`), with a long-lived Claude Code token
 * injected into the subprocess env so it never needs an interactive login, or
 * through a hosted vendor over HTTP. That token comes from one place only — the
 * row the operator pasted in Settings (`services/claudeCodeToken`, #109); the
 * environment is not consulted.
 *
 * The transports live in `ai-task-runner-effect` now: its `makeTaskRunner`
 * holds the one hosted-vs-CLI branch (#105, #128), composes `claude-code-effect`
 * for the CLI and the Vercel ai-sdk for the vendors, and takes miel's two
 * answers as a contract — `resolve` is `resolveTaskProviderEffect` (#125), so a
 * task pointed at a hosted vendor with no stored key fails as
 * `ProviderNotRunnableError` before a socket is opened, and `credential` reads
 * the vendor's key out of `encrypted_secrets` (#104), `Redacted` end to end.
 * The runner is a factory, not a tag, which is what keeps this module the
 * single injection seam (#133): miel's `Claude` tag wraps it, and nothing else
 * can acquire a second one.
 *
 * What stays here is everything that is a miel decision: the token's source,
 * the auth heuristic below, and the mapping of both transports' failures onto
 * miel's own error taxonomy (`errors.ts`), whose tags the API's error
 * middleware and the sync socket both key on.
 */
import { Duration, Effect, Layer, Option, Redacted } from "effect";
import type { CommandExecutor } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import {
  ClaudeCodeLive,
  ClaudeConfig,
  // The SDK's own missing-token tag — what the config's token effect must fail
  // with, so the SDK refuses before spawning. It is caught below and re-raised
  // as miel's identically-named error, which is the one the boundaries know.
  ClaudeTokenMissingError as SdkTokenMissing,
} from "claude-code-effect";
import { makeTaskRunner, type HostedGenerate, type TaskRunnerDeps } from "ai-task-runner-effect";
import { getEnv } from "../env";
import {
  ClaudeAuthError,
  ClaudeParseError,
  ClaudeSchemaError,
  ClaudeSpawnError,
  ClaudeTimeoutError,
  ClaudeTokenMissingError,
  HostedApiError,
  ProviderNotRunnableError,
  type ClaudeError,
} from "../errors";
import type { UnknownSettingError } from "../services/settings";
import { createDebug } from "../util/debug";
import { CLAUDE_TASKS, type ClaudeTaskInput, type ClaudeTaskOutput } from "./tasks";
// Imported from the service modules, not the barrel: the plaintext readers are
// not part of core's public surface (#109, ADR-0001).
import { readClaudeCodeTokenEffect } from "../services/claudeCodeToken";
import { readProviderCredentialEffect } from "../services/encryptedSecrets";
import type { ModelTask } from "../providerModels";
import type { SecretStore, SettingsStore, Stores } from "../stores/contracts";
import { resolveTaskProviderEffect } from "../services/taskProviders";

const debug = createDebug("claude");

export interface ClaudeRunResult<T> {
  output: T;
  runId: string;
  model: string;
}

/**
 * Which `CommandExecutor` the SDK spawns through.
 *
 * Production is Bun's, and there is no other caller in the shipped code. It is
 * a function rather than a constant so a suite can substitute the SDK's
 * `ClaudeCodeTest.handler` — the deep fake that answers with a canned capture,
 * leaving the real arg assembly, envelope parse and error mapping to run. That
 * seam used to be `mock.module("../adapters/shell")`, which is process-global
 * in Bun and no longer intercepts anything, since this transport does not go
 * through miel's shell adapter any more.
 */
let commandExecutorLayer: () => Layer.Layer<CommandExecutor.CommandExecutor> = () =>
  BunContext.layer;

/**
 * Substitute the executor layer, returning a restore function. Test-only —
 * named like the repo's other `_reset*ForTests` hooks and exempted from the
 * underscore lint rule for the same reason.
 */
export function _setCommandExecutorLayerForTests(
  layer: Layer.Layer<CommandExecutor.CommandExecutor> | null,
): void {
  commandExecutorLayer = layer === null ? () => BunContext.layer : () => layer;
}

/**
 * The hosted transport's one HTTP call, substitutable the same way: the
 * runner's `generateHosted` internal is the seam `ai-task-runner-effect`
 * exposes for tests, and this hook is how a miel suite reaches it — so the
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
 * This stays miel's rather than the SDK's on purpose. The distinction it draws
 * is miel's alone: `ClaudeAuthError` is a member of `ProviderUnavailableError`
 * (#126), so a token the CLI rejected stops the whole sync run with one toast,
 * while any other non-zero exit is this batch's problem and the run continues.
 * The SDK reports the same condition structurally — a non-zero exit with no
 * envelope — because it cannot know which of those two a consumer considers it.
 * Keeping the guess here also keeps it visible: it is a regex over CLI wording,
 * and CLI wording changes.
 */
function looksLikeAuthProblem(s: string): boolean {
  return /not logged in|please run \/login|unauthorized|invalid api key|invalid token|authentication/i.test(
    s,
  );
}

/**
 * miel's answers to the runner's two questions (#124, #125): which provider and
 * model a task runs on — the same resolver the settings doors use, so both
 * halves of the rule are one check — and which key a hosted vendor holds, read
 * through the one decryptor and wrapped `Redacted` so it is unwrapped only at
 * the call that spends it. A missing key answers `null`; the runner raises its
 * race-guard refusal, mapped back onto the resolver's own tag below.
 */
const runnerDeps: TaskRunnerDeps<
  ProviderNotRunnableError | UnknownSettingError,
  never,
  SettingsStore | SecretStore
> = {
  resolve: (task) => resolveTaskProviderEffect(task as ModelTask),
  credential: (vendor) =>
    readProviderCredentialEffect(vendor).pipe(
      // The provider is validated before it reaches here, so the service's
      // unknown-provider failure is unreachable; treat it as "no key" anyway.
      Effect.catchAll(() => Effect.succeed(null)),
      Effect.map((key) => (key ? Redacted.make(key) : null)),
    ),
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

export class Claude extends Effect.Tag("Claude")<Claude, ClaudeImpl>() {}

const runTask = <K extends ModelTask>(
  task: K,
  input: ClaudeTaskInput<K>,
): Effect.Effect<ClaudeRunResult<ClaudeTaskOutput<K>>, ClaudeError | UnknownSettingError, Stores> =>
  Effect.gen(function* () {
    const { CLAUDE_BIN } = getEnv();
    debug("run", { task });

    // The stored token, and nothing else (#109) — read per call through the
    // SDK config's effect-form token, so a token pasted in Settings takes
    // effect on the next run with no restart, and a missing row still fails
    // before any subprocess exists.
    const stores = yield* Effect.context<SecretStore>();
    const config = Layer.succeed(ClaudeConfig, {
      token: readClaudeCodeTokenEffect().pipe(
        Effect.provide(stores),
        Effect.flatMap((token) =>
          token ? Effect.succeed(Redacted.make(token)) : Effect.fail(new SdkTokenMissing()),
        ),
      ),
      binPath: CLAUDE_BIN,
      defaultModel: Option.none(),
      timeout: Duration.minutes(10),
    });

    const runner = makeTaskRunner(
      CLAUDE_TASKS,
      runnerDeps,
      hostedGenerateForTests === null ? {} : { generateHosted: hostedGenerateForTests },
    );

    const result = yield* runner.run(task, input).pipe(
      Effect.provide(Layer.provide(ClaudeCodeLive, Layer.merge(config, commandExecutorLayer()))),
      // The runner's and the SDK's taxonomies are structural; miel's says what
      // a failure *means* here, which is what every boundary above keys on.
      Effect.catchTags({
        // The runner's race guard — the key gone between resolve and read. It
        // is the same condition the resolver refuses, so it becomes the
        // resolver's own tag and a boundary cannot tell the two apart (#125).
        TaskNotRunnableError: (err) =>
          new ProviderNotRunnableError({
            task,
            provider: err.provider,
            reason: "missing_provider_credential",
            phase: "run",
          }),
        // The vendor answered and failed — one batch's problem, never the
        // install's. The runner already scrubbed the key from `detail`.
        HostedApiError: (err) => new HostedApiError({ detail: err.detail }),
        // A hosted payload the codec refused. The codec is miel's own
        // (`zodCodec` in ./tasks), so the issue rides inside; hosted schema
        // violations surface as vendor-call failures, exactly as before.
        TaskSchemaError: (err) =>
          new HostedApiError({
            detail: err.issues instanceof ClaudeSchemaError ? err.issues.issue : String(err.issues),
          }),
        // No token stored — the tag miel has always raised, and the reason the
        // config's effect form is used at all.
        ClaudeTokenMissingError: () => new ClaudeTokenMissingError(),
        // A CLI schema violation already carries miel's own tag out of the codec.
        ClaudeSchemaError: (err) =>
          err.issues instanceof ClaudeSchemaError
            ? err.issues
            : new ClaudeSchemaError({
                issue: String(err.issues),
                raw: JSON.stringify(err.raw).slice(0, 2000),
              }),
        // Exit ≠ 0 with no envelope: the auth heuristic decides whether this
        // stops the install or just this batch.
        ClaudeInvocationError: (err) =>
          looksLikeAuthProblem(err.stderr)
            ? new ClaudeAuthError({ detail: err.stderr.slice(0, 500) })
            : new ClaudeSpawnError({
                cause: { exitCode: err.exitCode, stderr: err.stderr },
              }),
        // A valid envelope reporting failure — same question, different source.
        ClaudeApiError: (err) =>
          looksLikeAuthProblem(err.message)
            ? new ClaudeAuthError({ detail: err.message.slice(0, 500) })
            : new ClaudeSpawnError({
                cause: {
                  reason: "envelope is_error",
                  result: err.message,
                  apiErrorStatus: err.apiErrorStatus,
                },
              }),
        // The child never launched at all (ENOENT / EACCES).
        ClaudeSpawnError: (err) =>
          new ClaudeSpawnError({ cause: { command: err.command, cause: err.cause } }),
        ClaudeParseError: (err) => new ClaudeParseError({ stage: "envelope", raw: err.stdout }),
        ClaudeTimeoutError: (err) => new ClaudeTimeoutError({ timeoutMs: err.timeoutMs }),
      }),
    );

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
    run: (task, input) => Effect.provide(runTask(task, input), stores),
  })),
);
