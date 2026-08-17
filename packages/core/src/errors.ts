/**
 * Core-wide tagged-error taxonomy.
 *
 * Every external boundary (subprocess, Google REST API, OAuth token refresh)
 * fails with a distinct `Data.TaggedError` so the `_tag` uniquely identifies
 * *where* a failure came from. The API/CLI/sync boundary pattern-matches on the
 * tag (`Effect.catchTags`) to map each one to an HTTP status / sync outcome.
 *
 * Grouped by the service that raises them. Modeled on worp's `src/lib/errors.ts`.
 */
import { Data } from "effect";
// The task vocabulary lives in the provider catalogue leaf (#123), which this
// module can import — a service holding it could not be imported here without a
// cycle, and every use of a task names a provider in the same breath.
import type { ModelTask, Provider } from "./providerModels";

// ── Shell (subprocess primitive shared by the claude adapter) ───────────────

/**
 * A spawned subprocess failed: non-zero exit, empty stdout where output was
 * expected, or unparseable JSON. Carries the full invocation for debugging.
 */
export class ShellError extends Data.TaggedError("ShellError")<{
  readonly cmd: string[];
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
  readonly message: string;
}> {}

// ── GoogleAuth (OAuth config / token lifecycle) ─────────────────────────────

/** Required OAuth env vars (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI) are absent. */
export class OAuthConfigError extends Data.TaggedError("OAuthConfigError")<{
  readonly missing: string[];
}> {}

/** The `/auth/google/callback` `?code=` → token exchange failed. */
export class OAuthExchangeError extends Data.TaggedError("OAuthExchangeError")<{
  readonly cause: unknown;
}> {}

/** No stored refresh token for the account (never connected, or revoked). */
export class AccountNotConnectedError extends Data.TaggedError("AccountNotConnectedError")<{
  readonly ref: string;
}> {}

/**
 * `getAccessToken()` failed to mint a fresh access token from the stored
 * refresh token — typically `invalid_grant` (the user revoked the grant). This
 * is the new home for the old gog `ReauthRequiredError` semantics; it now
 * resolves by re-running the in-app OAuth consent, not a CLI paste-back.
 */
export class TokenRefreshError extends Data.TaggedError("TokenRefreshError")<{
  readonly ref: string;
  readonly cause: unknown;
}> {}

// ── Gmail (shared + per-operation) ──────────────────────────────────────────

/** Gmail REST returned HTTP 401/403 — the token is invalid for this scope. */
export class GmailAuthError extends Data.TaggedError("GmailAuthError")<{
  readonly ref: string;
  readonly cause: unknown;
}> {}

/** Any other Gmail REST failure (5xx, network, unexpected 4xx). */
export class GmailApiError extends Data.TaggedError("GmailApiError")<{
  readonly op: string;
  readonly cause: unknown;
}> {}

/** A Gmail REST response did not match the expected Zod schema. */
export class GmailParseError extends Data.TaggedError("GmailParseError")<{
  readonly op: string;
  readonly cause: unknown;
}> {}

/** `users.messages.send` (reply) specifically failed. */
export class GmailSendError extends Data.TaggedError("GmailSendError")<{
  readonly cause: unknown;
}> {}

/** `users.labels.create` failed (includes the "label already exists" case). */
export class GmailLabelError extends Data.TaggedError("GmailLabelError")<{
  readonly name: string;
  readonly cause: unknown;
}> {}

/** `users.settings.filters.create` failed. */
export class GmailFilterError extends Data.TaggedError("GmailFilterError")<{
  readonly cause: unknown;
}> {}

/**
 * A filter merge was asked for something that can't be built: too few sources,
 * ids that aren't this account's, or criteria/actions with no single-filter
 * equivalent (contradictory label actions, two forward addresses). Raised
 * before any Gmail call, so nothing has changed when it surfaces.
 *
 * `reason` is what the boundary maps to a status; `message` is user-facing.
 */
export class FilterMergeError extends Data.TaggedError("FilterMergeError")<{
  readonly reason: "too_few" | "unknown_filters" | "unmergeable";
  readonly message: string;
  /** The offending source filter ids, when the reason names some. */
  readonly gmailFilterIds?: readonly string[];
}> {}

// ── Claude (`claude -p` subprocess + parsing + auth) ────────────────────────

/** The `claude` subprocess could not be spawned, or exited non-zero. */
export class ClaudeSpawnError extends Data.TaggedError("ClaudeSpawnError")<{
  readonly cause: unknown;
}> {}

/** The `claude` subprocess exceeded its time budget and was killed. */
export class ClaudeTimeoutError extends Data.TaggedError("ClaudeTimeoutError")<{
  readonly timeoutMs: number;
}> {}

/** No Claude Code token is stored — the CLI has no credentials to use. */
export class ClaudeTokenMissingError extends Data.TaggedError("ClaudeTokenMissingError")<{}> {}

/** The CLI reported its token is invalid / expired (defensive). */
export class ClaudeAuthError extends Data.TaggedError("ClaudeAuthError")<{
  readonly detail: string;
}> {}

/** The CLI envelope or the model's inner JSON did not parse. */
export class ClaudeParseError extends Data.TaggedError("ClaudeParseError")<{
  readonly stage: "envelope" | "result";
  readonly raw: string;
  readonly cause?: unknown;
}> {}

/** JSON parsed, but the model's output violated its declared schema. */
export class ClaudeSchemaError extends Data.TaggedError("ClaudeSchemaError")<{
  readonly issue: string;
  readonly raw: string;
}> {}

// ── Hosted API (ai-sdk provider) ────────────────────────────────────────────

/** Generic hosted API provider failure (network, auth, parsing, schema). */
export class HostedApiError extends Data.TaggedError("HostedApiError")<{
  readonly detail: string;
}> {}

// ── Provider credentials (LLM vendor API keys at rest) ──────────────────────

/**
 * A credential could not be accepted: unknown vendor, or a key that is blank
 * or implausibly short. Deliberately carries only the `reason` and the vendor —
 * never the rejected value, which would put a secret into logs and HTTP bodies
 * by the usual route (an error message quoting its input).
 */
export class InvalidProviderCredentialError extends Data.TaggedError(
  "InvalidProviderCredentialError",
)<{
  readonly provider: string;
  readonly reason: "unknown_provider" | "empty" | "too_short";
}> {}

// ── Task providers (which vendor a task may be pointed at) ──────────────────

/**
 * When the rule was applied: on a save, or on the way into a run.
 *
 * The same condition, but not the same news (#125). A `save` refusal is the
 * user's edit being rejected while they are still looking at the picker — a
 * 400. A `run` refusal is an install already in that state discovering it as it
 * tries to work: nothing the current request said is wrong, the AI is simply
 * unavailable, which is the 503 a missing Claude Code token gets.
 */
export type TaskProviderPhase = "save" | "run";

/**
 * A task cannot run on the provider it is pointed at (#124): the vendor has no
 * stored credential, or the model named is not one that vendor serves.
 *
 * Raised by `services/taskProviders.ts` — before anything is written, so a patch
 * carrying one bad task is refused whole rather than half-applied, and since
 * #125 before any transport runs, so a hosted vendor with no key fails without
 * a socket being opened. Carries the task, the vendor, a reason code and the
 * {@link TaskProviderPhase} — and, for a model problem, the offending model id,
 * which is safe to echo. Never a credential, and no field that could hold one:
 * the check reads the *boolean* status of a key, never the key.
 *
 * No user-facing prose either. "Add the credential under Settings" is copy, and
 * copy belongs at the edges that own it — the unavailable toast and the error
 * display — not in a core error that a log, the CLI and three UIs all read.
 */
export class ProviderNotRunnableError extends Data.TaggedError("ProviderNotRunnableError")<{
  readonly task: ModelTask;
  readonly provider: Provider;
  readonly reason: "missing_provider_credential" | "invalid_model_for_provider";
  readonly phase: TaskProviderPhase;
  /** The model id that the provider does not serve, when that is the reason. */
  readonly model?: string;
}> {}

// ── Encrypted secrets (name-keyed secret store) ─────────────────────────────

/**
 * A secret could not be accepted: blank, or so short it cannot be the
 * credential it claims to be. Like {@link InvalidProviderCredentialError} it
 * carries the reason and the secret's *name*, never the rejected value — an
 * error message quoting its input is the usual way a secret reaches a log.
 */
export class InvalidSecretError extends Data.TaggedError("InvalidSecretError")<{
  readonly name: string;
  readonly reason: "empty" | "too_short";
}> {}

// ── worp ingest relay ───────────────────────────────────────────────────────

/**
 * worp's base URL and/or API key are unset in Settings — the relay route is
 * off. Since #107 this is the fresh-install default rather than a rarity: the
 * config is entered in the app, and nothing is imported from the environment.
 */
export class WorpNotConfiguredError extends Data.TaggedError("WorpNotConfiguredError")<{}> {}

/**
 * A worp settings patch was refused before anything was written. Carries the
 * field and a reason code — and, for a header problem, the offending header's
 * name, which is safe to echo where its value would not be.
 */
export class InvalidWorpSettingsError extends Data.TaggedError("InvalidWorpSettingsError")<{
  readonly field: "baseUrl" | "apiKey" | "extraHeaders";
  readonly reason:
    | "not_a_url"
    | "not_http"
    // The key is too short to be a credential — the same bar and the same reason
    // code the other secrets reject with (#118). It is reported in this
    // vocabulary rather than as an `InvalidSecretError` because a caller of this
    // route is patching named fields and needs to know *which* one was refused,
    // and because the refusal happens before anything is stored.
    | "too_short"
    | "not_an_object"
    | "value_not_a_string"
    | "invalid_header_name"
    | "reserved_header_name";
  readonly header?: string;
}> {}

/**
 * worp's `/api/ingest` returned a non-2xx status or an unreadable body. Carries
 * the upstream status + payload so the API layer can surface worp's own error.
 */
export class WorpIngestError extends Data.TaggedError("WorpIngestError")<{
  readonly status: number;
  readonly body: unknown;
  readonly message: string;
}> {}

// ── Unions ──────────────────────────────────────────────────────────────────

/** Everything `GoogleAuth.clientFor` can fail with. */
export type GoogleAuthError = AccountNotConnectedError | TokenRefreshError;

/** Shared Gmail failure set every read-ish operation can produce. */
export type GmailReadError = GmailAuthError | GmailApiError | GmailParseError;

/**
 * "The chosen AI provider cannot run" — the one condition sync, the API and the
 * WebSocket handler all act on, and the one place it is spelled out (#126).
 *
 * Three ways to be in it, and they are the same news to a caller: no Claude Code
 * token, a token the CLI rejected, or a task pointed at a vendor with no stored
 * key (or a model it does not serve). Every one of them means the work cannot
 * start, so the run stops, `sync.provider_unavailable` fires and the user is sent
 * to Settings — as opposed to {@link HostedApiError}, where the vendor *was*
 * reached and failed, which is one batch's problem and not the install's.
 *
 * It lives here rather than in the five callers because it was in the five
 * callers: each hardcoded the two Claude tags and only one ever learned the
 * third, so a keyless hosted vendor quietly burned every batch.
 */
export type ProviderUnavailableError =
  | ClaudeTokenMissingError
  | ClaudeAuthError
  | ProviderNotRunnableError;

/**
 * The union's tags, keyed *by* the union: a member added above and not listed
 * here does not compile. That is what makes adding a fourth way to be
 * unavailable one edit to this file — every consumer reads the derived set
 * through {@link isProviderUnavailable}, none of them names a tag.
 */
const PROVIDER_UNAVAILABLE: Record<ProviderUnavailableError["_tag"], true> = {
  ClaudeTokenMissingError: true,
  ClaudeAuthError: true,
  ProviderNotRunnableError: true,
};

/** {@link ProviderUnavailableError}'s tags, for boundaries that match on `_tag`. */
export const PROVIDER_UNAVAILABLE_TAGS: ReadonlySet<string> = new Set(
  Object.keys(PROVIDER_UNAVAILABLE),
);

/**
 * Whether a failure means the provider cannot run.
 *
 * Matches on `_tag`, not `instanceof`: the API middleware and the sync socket
 * catch `unknown` at a promise boundary, where an error may have been built by
 * another copy of this module, and both already classified that way.
 */
export function isProviderUnavailable(err: unknown): err is ProviderUnavailableError {
  const tag = (err as { _tag?: unknown } | null | undefined)?._tag;
  return typeof tag === "string" && PROVIDER_UNAVAILABLE_TAGS.has(tag);
}

/** Everything the Claude service can fail with. */
export type ClaudeError =
  | ShellError
  | ClaudeSpawnError
  | ClaudeTimeoutError
  | ClaudeTokenMissingError
  | ClaudeAuthError
  | ClaudeParseError
  | ClaudeSchemaError
  | HostedApiError
  // Since #125 the service resolves the task's provider before it picks a
  // transport, so "this task cannot run at all" is one of its failures.
  | ProviderNotRunnableError;
