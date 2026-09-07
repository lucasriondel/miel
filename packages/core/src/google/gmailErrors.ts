/**
 * Maps a thrown googleapis/gaxios error onto the right tagged error.
 *
 * The Gmail client (gaxios) rejects with an error carrying a numeric `code`
 * (the HTTP status). 401/403 means the token is bad for this scope → a
 * `GmailAuthError` the boundary turns into "reconnect with Google"; anything
 * else is a generic `GmailApiError` tagged with the operation name. Mirrors
 * worp `Drive.ts:18-21`.
 */
import { GmailApiError, GmailAuthError } from "../errors";

/** True when a gaxios error is an auth failure (HTTP 401/403). */
export function isAuthErr(err: unknown): boolean {
  const code = (err as { code?: unknown; status?: unknown })?.code;
  const status = (err as { code?: unknown; status?: unknown })?.status;
  const n =
    typeof code === "number" ? code : typeof status === "number" ? status : Number(code ?? status);
  return n === 401 || n === 403;
}

/** Map a gaxios throw to GmailAuthError (401/403) or a per-op GmailApiError. */
export function toGmailError(
  op: string,
  ref: string,
  err: unknown,
): GmailAuthError | GmailApiError {
  return isAuthErr(err)
    ? new GmailAuthError({ ref, cause: err })
    : new GmailApiError({ op, cause: err });
}
