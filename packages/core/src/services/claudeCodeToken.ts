/**
 * The Claude Code CLI's long-lived token (#109).
 *
 * It was the one AI credential miel could read from the environment: taken
 * straight from `CLAUDE_CODE_OAUTH_TOKEN` when the subprocess is spawned, while
 * every vendor key is pasted in Settings and stored encrypted. It now lives in
 * `encrypted_secrets` under {@link CLAUDE_CODE_TOKEN_SECRET}, through the same
 * `services/encryptedSecrets` plumbing — which stays the only decryptor — and
 * that row is the *only* source. The environment variable is not consulted, not
 * as a fallback and not on a store failure: an install triages with the token
 * its operator pasted, or it does not triage.
 *
 * That makes this credential the same shape as the other three (a vendor key,
 * worp's key): one home, one status of "configured plus a masked hint", and no
 * ambient value a deploy can pick up without anyone choosing it. Nothing here
 * logs a token or puts one in an error.
 *
 * {@link readClaudeCodeTokenEffect} — the plaintext reader — is deliberately not
 * re-exported from `packages/core/src/index.ts`; `claude/Claude.ts` imports this
 * module directly.
 */
import { Effect } from "effect";
import type { InvalidSecretError } from "../errors";
import { SecretStore } from "../stores/contracts";
import { SecretStoreLive } from "../stores/postgres";
import { createDebug } from "../util/debug";
import { runPromiseRethrow } from "../util/effect";
import {
  deleteSecretEffect,
  getSecretStatusEffect,
  readSecretEffect,
  setSecretEffect,
} from "./encryptedSecrets";

const debug = createDebug("service:claudeCodeToken");

/**
 * The row this token occupies in `encrypted_secrets`. Dotted like worp's two
 * names (#107) rather than bare like a vendor's, because the store is keyed by
 * "a secret's name" and the namespace is what keeps the two kinds apart.
 */
export const CLAUDE_CODE_TOKEN_SECRET = "claude_code.oauth_token";

/** What the outside world is allowed to know about the Claude Code token. */
export interface ClaudeCodeTokenStatus {
  configured: boolean;
  /** A masked hint (`sk-ant-…3f9`), or null when there is no token to hint at. */
  hint: string | null;
}

export const getClaudeCodeTokenStatusEffect = (): Effect.Effect<
  ClaudeCodeTokenStatus,
  never,
  SecretStore
> =>
  Effect.gen(function* () {
    const status = yield* getSecretStatusEffect(CLAUDE_CODE_TOKEN_SECRET);
    debug("status", { configured: status.configured });
    return status;
  });

export const setClaudeCodeTokenEffect = (
  token: string,
): Effect.Effect<ClaudeCodeTokenStatus, InvalidSecretError, SecretStore> =>
  setSecretEffect(CLAUDE_CODE_TOKEN_SECRET, token);

/** Clears the stored token. There is no other source, so nothing takes over. */
export const deleteClaudeCodeTokenEffect = (): Effect.Effect<
  ClaudeCodeTokenStatus,
  never,
  SecretStore
> => deleteSecretEffect(CLAUDE_CODE_TOKEN_SECRET);

/**
 * INTERNAL. The token the CLI subprocess should be given, or null when none is
 * stored (the caller raises its own missing-token error).
 *
 * Not exported from the package barrel. A secret store that cannot be read is a
 * failure rather than a null: with no environment fallback left, answering
 * "no token" on a database blip would report a missing credential to a user who
 * has one, and invite them to paste it again.
 */
export const readClaudeCodeTokenEffect = (): Effect.Effect<string | null, never, SecretStore> =>
  readSecretEffect(CLAUDE_CODE_TOKEN_SECRET);

// Promise facades for the API/CLI boundary. `readClaudeCodeToken` has none on
// purpose: a Promise facade is a boundary API, and the token has no business at
// a boundary.
const run = <A, E>(eff: Effect.Effect<A, E, SecretStore>): Promise<A> =>
  runPromiseRethrow(Effect.provide(eff, SecretStoreLive));

export async function getClaudeCodeTokenStatus(): Promise<ClaudeCodeTokenStatus> {
  return run(getClaudeCodeTokenStatusEffect());
}

export async function setClaudeCodeToken(token: string): Promise<ClaudeCodeTokenStatus> {
  return run(setClaudeCodeTokenEffect(token));
}

export async function deleteClaudeCodeToken(): Promise<ClaudeCodeTokenStatus> {
  return run(deleteClaudeCodeTokenEffect());
}
