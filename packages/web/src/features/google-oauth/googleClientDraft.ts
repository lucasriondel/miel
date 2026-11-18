import type { GoogleOAuthConfigStatus, SaveGoogleOAuthInput } from "../../api/types";
import { suggestedRedirectUri } from "../onboarding/setupPrompt";

/**
 * The rules between the Google client form's three boxes and the request
 * (A15), pure so what a keystroke allows is assertable without a DOM. The
 * onboarding gate's Google step and the Settings card share them, and the
 * form component on both.
 */

export type GoogleClientField = "clientId" | "clientSecret" | "redirectUri";

export interface GoogleClientDraft {
  clientId: string;
  /** Empty means "keep the stored one" when one may be kept. */
  clientSecret: string;
  redirectUri: string;
}

/** What the form shows under one field when the server refuses the save. */
export interface FieldRefusal {
  field: GoogleClientField;
  message: string;
}

/**
 * The redirect URI the form starts from: the one in effect, else this app's API
 * callback on the address it was built with (`<server URL>/api/auth/google/callback`
 * for the same-origin deployment). Google rejects `.localhost` hostnames, so a
 * dev build fronted by one starts from the fixed loopback URI the dev API
 * serves instead.
 */
export function defaultRedirectUri(
  status: GoogleOAuthConfigStatus,
  apiBase: string,
  origin: string,
): string {
  if (status.redirectUri) return status.redirectUri;
  const suggested = suggestedRedirectUri(apiBase, origin);
  return new URL(suggested).hostname.endsWith(".localhost") ? status.devRedirectUri : suggested;
}

export const initialDraft = (
  status: GoogleOAuthConfigStatus,
  redirectUri: string,
): GoogleClientDraft => ({
  clientId: status.clientId ?? "",
  clientSecret: "",
  redirectUri,
});

/**
 * Whether an empty secret box means "keep the stored secret": only a client
 * saved in miel has one to keep, and only for the same client ID — a secret
 * belongs to the client that issued it.
 */
export const canKeepSecret = (status: GoogleOAuthConfigStatus, draft: GoogleClientDraft): boolean =>
  status.source === "database" && draft.clientId.trim() === status.clientId;

export const draftIsSavable = (
  status: GoogleOAuthConfigStatus,
  draft: GoogleClientDraft,
): boolean =>
  draft.clientId.trim().length > 0 &&
  draft.redirectUri.trim().length > 0 &&
  (draft.clientSecret.trim().length > 0 || canKeepSecret(status, draft));

/**
 * How many mailboxes saving this draft would disconnect — a Google refresh
 * token belongs to the client that issued it — or 0 when it would not.
 */
export const mailboxesDisconnected = (
  status: GoogleOAuthConfigStatus,
  draft: GoogleClientDraft,
): number =>
  status.source !== null &&
  status.accountsToReconnect > 0 &&
  draft.clientId.trim() !== status.clientId
    ? status.accountsToReconnect
    : 0;

export const disconnectWarning = (count: number): string =>
  `This disconnects ${count} ${count === 1 ? "mailbox" : "mailboxes"}; each has to reconnect.`;

/** The PUT body: trimmed, and with no secret when the box is empty. */
export function toSaveInput(draft: GoogleClientDraft): SaveGoogleOAuthInput {
  const secret = draft.clientSecret.trim();
  return {
    clientId: draft.clientId.trim(),
    redirectUri: draft.redirectUri.trim(),
    ...(secret ? { clientSecret: secret } : {}),
  };
}

const FIELDS: readonly GoogleClientField[] = ["clientId", "clientSecret", "redirectUri"];

/**
 * The field a refused save names (`400 invalid_google_oauth_config`), with the
 * server's sentence, or null for any other failure. Read off the error's body
 * rather than narrowed by class, so it holds whichever `ApiError` threw it.
 */
export function fieldRefusal(err: unknown): FieldRefusal | null {
  if (!err || typeof err !== "object" || !("body" in err)) return null;
  const body = (err as { body: unknown }).body;
  if (!body || typeof body !== "object") return null;
  const { error, field, message } = body as Record<string, unknown>;
  if (error !== "invalid_google_oauth_config") return null;
  if (!FIELDS.includes(field as GoogleClientField)) return null;
  return {
    field: field as GoogleClientField,
    message: typeof message === "string" && message ? message : "This value was refused.",
  };
}
