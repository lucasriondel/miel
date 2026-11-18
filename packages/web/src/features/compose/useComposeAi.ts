import { useCallback, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import {
  cancelGeneration,
  generateMessageMutationOptions,
  isGenerationCancelled,
  type PreviousDraft,
} from "../../api/compose.hooks";
import { generateReplyMutationOptions, type GenerateReplyResult } from "../../api/mutations";
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
  /** The body the window opened with (a drafted reply handed over), not counted as an edit. */
  initialBody: string;
  update: (patch: Partial<ComposeFields>) => void;
}

let generation = 0;
/** One id per request, so Stop names the generation it means and no other. */
const newRequestId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `gen-${Date.now().toString(36)}-${(generation += 1)}`;

/**
 * The AI half of a compose window — the instruction strip's lifecycle
 * (idle → generating → drafted, plus the guard rails: regenerating over an
 * edited body asks first, a failure leaves the body as it was).
 *
 * A new mail drafts through `/compose/generate`; anything answering a message
 * through that message's `generate-reply`. A refinement chip hands the model
 * the window's current draft (`previousDraft`) with the chip as the
 * instruction, so "Shorter" edits what is there instead of starting over.
 *
 * Stop is real: every request carries an id of the window's choosing, and Stop
 * both drops the request and asks the server to cancel that id, which kills the
 * provider call. The server's `generation_cancelled` answer is the stop being
 * confirmed, never an error to show.
 */
export function useComposeAi({ session, initialBody, update }: Options) {
  const { fields, message } = session;
  const [generating, setGenerating] = useState(false);
  const [draftedFrom, setDraftedFrom] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<string | null>(null);
  const abort = useRef<{ controller: AbortController; requestId: string } | null>(null);

  /** Typed over: what is in the body is not what the AI (or the prefill) put there. */
  const bodyEdited =
    fields.body.trim().length > 0 &&
    fields.body !== (draftBody ?? initialBody) &&
    fields.body.trim() !== initialBody.trim();

  const request = useCallback(
    (
      prompt: string,
      extra: { requestId: string; previousDraft?: PreviousDraft },
      signal: AbortSignal,
    ): Promise<GenerateReplyResult> =>
      session.kind === "new" || !message
        ? generateMessageMutationOptions().mutationFn({
            accountId: fields.fromAccountId,
            prompt,
            to: fields.to,
            subject: fields.subject.trim() || undefined,
            ...extra,
            signal,
          })
        : generateReplyMutationOptions().mutationFn({
            accountId: message.accountId,
            gmailMessageId: message.gmailMessageId,
            prompt,
            ...extra,
            signal,
          }),
    [session.kind, fields.fromAccountId, message, fields.to, fields.subject],
  );

  /**
   * One generation: `instruction` is what the model is told, `shown` what the
   * strip says the draft came from (a refinement is told "Shorter" but shows
   * the whole chain of instructions).
   */
  const generate = useCallback(
    async (instruction: string, shown: string, previousDraft?: PreviousDraft) => {
      setPending(null);
      setError(null);
      setGenerating(true);
      const controller = new AbortController();
      const requestId = newRequestId();
      abort.current = { controller, requestId };
      try {
        const result = await request(instruction, { requestId, previousDraft }, controller.signal);
        const keepSubject = fields.subject.trim().length > 0 && session.kind !== "new";
        update({
          body: result.body,
          prompt: shown,
          ...(keepSubject || !result.subject ? {} : { subject: result.subject }),
        });
        setDraftBody(result.body);
        setDraftedFrom(shown);
      } catch (err) {
        const stopped = isAbort(err) || controller.signal.aborted || isGenerationCancelled(err);
        if (!stopped) setError(err);
      } finally {
        if (abort.current?.controller === controller) abort.current = null;
        setGenerating(false);
      }
    },
    [request, fields.subject, session.kind, update],
  );

  const run = useCallback(
    async (instruction: string, force = false) => {
      const prompt = instruction.trim();
      if (!prompt || generating) return;
      if (!force && bodyEdited) {
        setPending(prompt);
        return;
      }
      await generate(prompt, prompt);
    },
    [generating, bodyEdited, generate],
  );

  /** A chip ("Shorter", "In French"): the model edits the draft on screen, edits included. */
  const refine = useCallback(
    async (refinement: string, shown: string) => {
      if (generating) return;
      const previousDraft = {
        body: fields.body,
        ...(fields.subject.trim() ? { subject: fields.subject } : {}),
      };
      await generate(refinement, shown, previousDraft);
    },
    [generating, fields.body, fields.subject, generate],
  );

  const stop = useCallback(() => {
    const running = abort.current;
    if (!running) return;
    running.controller.abort();
    void cancelGeneration(running.requestId).catch(() => {});
  }, []);
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

  return { status, draftedFrom, error, pending, bodyEdited, run, refine, stop, keepMine };
}
