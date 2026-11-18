import { useCallback, useEffect, useRef, useState } from "react";
import { deleteDraft, saveDraft } from "../../api/compose.hooks";
import type { ComposeSession } from "./composeSession";

export type DraftStatus = "idle" | "saving" | "saved" | "failed";

interface Options {
  session: ComposeSession;
  /** False while sending, once sent, and once discarded: nothing is saved then. */
  enabled: boolean;
  /** Whether what is on screen is worth a draft at all (an untouched reply is not). */
  worthSaving: boolean;
  delayMs: number;
}

/**
 * The compose window's autosave into Gmail drafts (the footer's "Saving
 * draft…" / "Saved to Gmail drafts · 10:41").
 *
 * Debounced on the fields a mail is made of. The first save creates the draft
 * and every later one names its id, so pausing ten times leaves one draft, not
 * ten. A send waits for a save already in flight (`flush`) so the id it hands
 * the server — which deletes the draft once the mail is out — is the real one.
 */
export function useDraftAutosave({ session, enabled, worthSaving, delayMs }: Options) {
  const { fields } = session;
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string | null>(null);
  const stopped = useRef(false);

  const payload = JSON.stringify({
    to: fields.to,
    cc: fields.cc,
    bcc: fields.bcc,
    subject: fields.subject,
    body: fields.body,
  });

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const save = useCallback(
    (snapshot: string) => {
      const run = async () => {
        setStatus("saving");
        try {
          const parsed = JSON.parse(snapshot) as {
            to: string[];
            cc: string[];
            bcc: string[];
            subject: string;
            body: string;
          };
          const result = await saveDraft({
            accountId: session.accountId,
            draftId: draftIdRef.current ?? undefined,
            replyToGmailMessageId:
              session.kind === "reply" || session.kind === "replyAll"
                ? session.message?.gmailMessageId
                : undefined,
            ...parsed,
          });
          draftIdRef.current = result.draftId;
          setDraftId(result.draftId);
          lastSaved.current = snapshot;
          setSavedAt(new Date(result.savedAt));
          setStatus("saved");
        } catch {
          setStatus("failed");
        }
      };
      const previous = inFlight.current ?? Promise.resolve();
      const next = previous.then(run);
      inFlight.current = next;
      return next;
    },
    [session.accountId, session.kind, session.message?.gmailMessageId],
  );

  useEffect(() => {
    if (!enabled || !worthSaving || stopped.current || payload === lastSaved.current) return;
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      void save(payload);
    }, delayMs);
    return clearTimer;
  }, [enabled, worthSaving, payload, delayMs, save]);

  /** Before a send: no more saves, and the id of the one in flight. */
  const flush = useCallback(async (): Promise<string | undefined> => {
    clearTimer();
    await inFlight.current;
    return draftIdRef.current ?? undefined;
  }, []);

  /** Discarding: stop saving, and take the draft out of Gmail too. */
  const discard = useCallback(async () => {
    stopped.current = true;
    clearTimer();
    await inFlight.current;
    const id = draftIdRef.current;
    if (id) await deleteDraft(session.accountId, id).catch(() => {});
  }, [session.accountId]);

  return { status, savedAt, draftId, flush, discard };
}
