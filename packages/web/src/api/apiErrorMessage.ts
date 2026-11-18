import { ApiError } from "./client";

/**
 * The sentence to show a user for a failed request — the one describer the whole
 * app uses (#130), so a failure reads the same wherever it surfaces.
 *
 * `apiFetch` names an `ApiError` after the envelope's `error` field, which is a
 * machine code — "filter_merge_failed" tells nobody why. Most API error
 * responses carry a `message` beside it, so prefer that. The code stays as the
 * fallback for the envelopes that deliberately have none: a rejected credential
 * sends a `reason` rather than a message, because a message would quote the key.
 *
 * For a few of those codes the fallback is not good enough — the user reads
 * `claude_unavailable` and is left to guess — and the sentence cannot come from
 * the server either: core states the condition and the edges own the words
 * (#125). {@link codeCopy} is where those words live for the error displays;
 * the sync toast has its own, longer, for the same code.
 */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body;
    if (body && typeof body === "object") {
      if ("message" in body) {
        const message = (body as { message: unknown }).message;
        if (typeof message === "string" && message.length > 0) return message;
      }
      const copy = codeCopy(err.message, (body as { reason?: unknown }).reason);
      if (copy !== null) return copy;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

/**
 * A send, a draft or a scheduled send the server refused before anything left
 * (`ComposeRefusedError`). Its own message names ids — "Upload not found:
 * 3f2…" — which tell the person at the window nothing, so the reasons that are
 * about something having gone away say what went and what to do instead. The
 * refusals whose server sentence already reads well (`attachment_too_large`'s
 * "48.0 MB — over Gmail's 25 MB.", `no_recipients`) are left to it.
 */
const composeRefusalCopy: Readonly<Record<string, string>> = {
  account_not_found:
    "That mailbox is no longer connected to miel — reconnect it or send from another.",
  message_not_found: "The message this answers is no longer in miel — it may have been deleted.",
  upload_not_found:
    "An attachment is no longer on the server. Remove its chip and attach the file again.",
  attachment_not_found:
    "One of the original's attachments is no longer in Gmail. Remove its chip to forward without it.",
  scheduled_not_found: "That scheduled send no longer exists — it was sent or cancelled.",
  send_as_not_allowed:
    "Gmail has not verified that From address for this mailbox. Pick another one.",
};

/**
 * {@link apiErrorMessage} for what the compose window sends, saves or schedules.
 * Kept apart because the same codes answer other routes too — a message page
 * whose message is gone is not a refused send.
 */
export function composeErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const copy = composeRefusalCopy[err.message];
    if (copy) return copy;
  }
  return apiErrorMessage(err);
}

/**
 * The sentence for a code that travels without one, or null to fall back.
 *
 * `claude_unavailable` covers every way an AI task cannot start: no credential
 * for the vendor it is pointed at, a model that vendor does not serve, or a
 * Claude Code token that is missing or expired. All of them are fixed in the
 * same place, so all of them say so; the reason only changes what to fix there.
 */
function codeCopy(code: string, reason: unknown): string | null {
  const refusal = REFUSAL_COPY[code];
  if (refusal) return refusal;
  if (code !== "claude_unavailable") return null;
  if (reason === "invalid_model_for_provider") {
    return "The model this task is set to isn't one its provider serves. Pick another in Settings.";
  }
  return "The AI provider isn't ready. Add or fix its credential in Settings.";
}

/**
 * Refusals a snooze or a scheduled send can come back with, for when the
 * envelope carries no message of its own.
 */
const REFUSAL_COPY: Record<string, string> = {
  time_in_past: "That time has already passed. Pick one in the future.",
};
