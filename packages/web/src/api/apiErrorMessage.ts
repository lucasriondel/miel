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
 * The sentence for a code that travels without one, or null to fall back.
 *
 * `claude_unavailable` covers every way an AI task cannot start: no credential
 * for the vendor it is pointed at, a model that vendor does not serve, or a
 * Claude Code token that is missing or expired. All of them are fixed in the
 * same place, so all of them say so; the reason only changes what to fix there.
 */
function codeCopy(code: string, reason: unknown): string | null {
  if (code !== "claude_unavailable") return null;
  if (reason === "invalid_model_for_provider") {
    return "The model this task is set to isn't one its provider serves. Pick another in Settings.";
  }
  return "The AI provider isn't ready. Add or fix its credential in Settings.";
}
