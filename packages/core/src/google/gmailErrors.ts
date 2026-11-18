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

/** The longest refusal reason passed on; Gmail's are one line. */
const MAX_DETAIL = 300;

/**
 * Gmail's own reason for refusing a request, safe to show the user.
 *
 * gaxios puts the API's message in `response.data.error.message` (with
 * `errors[0].message` as an older spelling) and falls back to its own
 * `message`. Whatever is picked is scrubbed of anything that looks like a
 * credential — a bearer header or an OAuth access token — before it leaves,
 * because this string travels to an HTTP body.
 */
export function gmailRefusalDetail(err: unknown): string | undefined {
  const e = err as {
    message?: unknown;
    errors?: { message?: unknown }[];
    response?: { data?: { error?: { message?: unknown } | string } };
  } | null;
  const apiError = e?.response?.data?.error;
  const candidates = [
    typeof apiError === "object" ? apiError?.message : apiError,
    e?.errors?.[0]?.message,
    e?.message,
  ];
  const raw = candidates.find((c): c is string => typeof c === "string" && c.trim().length > 0);
  if (!raw) return undefined;
  const scrubbed = raw
    .replace(/Bearer\s+[\w.~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/ya29\.[\w.-]+/g, "[redacted]")
    .replace(/1\/\/[\w.-]{20,}/g, "[redacted]")
    .trim();
  return scrubbed.length > MAX_DETAIL ? `${scrubbed.slice(0, MAX_DETAIL)}…` : scrubbed;
}
