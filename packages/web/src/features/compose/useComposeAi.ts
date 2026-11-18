import { useCallback, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { generateMessageMutationOptions } from "../../api/compose.hooks";
import { generateReplyMutationOptions, type GenerateReplyResult } from "../../api/mutations";
import { forwardBody } from "../reply/replyDefaults";
import type { ComposeFields, ComposeSession } from "./composeSession";

export type AiStatus = "idle" | "generating" | "drafted" | "confirm" | "failed" | "unavailable";

/**
 * A provider that cannot run (no credential, a model it does not serve) is a
 * 503 `claude_unavailable`: not this draft's failure but the install's, so the
 * strip says drafting is off and points at Settings instead of offering Retry.
 */
export const isProviderUnavailable = (err: unknown): boolean =>
  err instanceof ApiError && err.status === 503 && err.message === "claude_unavailable";

const isAbort = (err: unknown): boolean =>
  err instanceof DOMException
    ? err.name === "AbortError"
    : err instanceof Error && err.name === "AbortError";

interface Options {
  session: ComposeSession;
  /** The body the window opened with (a forward's quoted block), not counted as an edit. */
  initialBody: string;
  update: (patch: Partial<ComposeFields>) => void;
}

/**
 * The AI half of a compose window — the instruction strip's lifecycle
 * (idle → generating → drafted, plus the guard rails: regenerating over an
 * edited body asks first, a failure leaves the body as it was).
 *
 * A new mail drafts through `/compose/generate`; anything answering a message
 * through that message's `generate-reply`. A forward keeps its quoted block
 * under whatever the AI writes above it.
 *
 * Stop aborts the request in the browser only: the provider call already
 * running on the server finishes there and its answer is dropped.
 */
export function useComposeAi({ session, initialBody, update }: Options) {
  const { fields, message } = session;
  const [generating, setGenerating] = useState(false);
  const [draftedFrom, setDraftedFrom] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  /** Typed over: what is in the body is not what the AI (or the prefill) put there. */
  const bodyEdited =
    fields.body.trim().length > 0 &&
    fields.body !== (draftBody ?? initialBody) &&
    fields.body.trim() !== initialBody.trim();

  const request = useCallback(
    (prompt: string, signal: AbortSignal): Promise<GenerateReplyResult> =>
      session.kind === "new" || !message
        ? generateMessageMutationOptions().mutationFn({
            accountId: session.accountId,
            prompt,
            to: fields.to,
            subject: fields.subject.trim() || undefined,
            signal,
          })
        : generateReplyMutationOptions().mutationFn({
            accountId: message.accountId,
            gmailMessageId: message.gmailMessageId,
            prompt,
            signal,
          }),
    [session.kind, session.accountId, message, fields.to, fields.subject],
  );

  const run = useCallback(
    async (instruction: string, force = false) => {
      const prompt = instruction.trim();
      if (!prompt || generating) return;
      if (!force && bodyEdited) {
        setPending(prompt);
        return;
      }
      setPending(null);
      setError(null);
      setGenerating(true);
      const controller = new AbortController();
      abort.current = controller;
      try {
        const result = await request(prompt, controller.signal);
        const body =
          session.kind === "forward" && message
            ? `${result.body.trimEnd()}${forwardBody(message)}`
            : result.body;
        const keepSubject = fields.subject.trim().length > 0 && session.kind !== "new";
        update({
          body,
          prompt,
          ...(keepSubject || !result.subject ? {} : { subject: result.subject }),
        });
        setDraftBody(body);
        setDraftedFrom(prompt);
      } catch (err) {
        if (!isAbort(err) && !controller.signal.aborted) setError(err);
      } finally {
        if (abort.current === controller) abort.current = null;
        setGenerating(false);
      }
    },
    [generating, bodyEdited, request, session.kind, message, fields.subject, update],
  );

  const stop = useCallback(() => abort.current?.abort(), []);
  const keepMine = useCallback(() => setPending(null), []);

  const status: AiStatus = generating
    ? "generating"
    : pending !== null
      ? "confirm"
      : error
        ? isProviderUnavailable(error)
          ? "unavailable"
          : "failed"
        : draftedFrom !== null
          ? "drafted"
          : "idle";

  return { status, draftedFrom, error, pending, bodyEdited, run, stop, keepMine };
}
