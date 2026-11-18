import { useCallback, useEffect, useRef, useState } from "react";
import { deleteDraft, saveDraft, type SaveDraftInput } from "../../api/compose.hooks";
import { quoteFields } from "../reply/quoteText";
import type { ComposeFields, ComposeSession } from "./composeSession";

export type DraftStatus = "idle" | "saving" | "saved" | "failed";

interface Options {
  session: ComposeSession;
  /** False while sending, once sent, and once discarded: nothing is saved then. */
  enabled: boolean;
  /** Whether what is on screen is worth a draft at all (an untouched reply is not). */
  worthSaving: boolean;
  delayMs: number;
  /** Keeps the draft's id with the window's fields, so a reopened window replaces it. */
  update: (patch: Partial<ComposeFields>) => void;
}

/**
 * Where a draft lives and what it says. A reply's draft is filed in the
 * answered message's mailbox and thread, with the quote as the send will carry
 * it; any other draft in the mailbox it will be sent from. A reply answered
 * from another mailbox is drafted where the message is, as a plain reply: the
 * alias and the files belong to the other mailbox, which a draft here cannot
 * name.
 */
export const draftRequest = (session: ComposeSession): Omit<SaveDraftInput, "draftId"> => {
  const { fields, kind, message } = session;
  const reply = (kind === "reply" || kind === "replyAll") && message !== null;
  const accountId = message && kind !== "new" ? message.accountId : fields.fromAccountId;
  const ownSender = accountId === fields.fromAccountId;
  const uploadIds = ownSender
    ? fields.uploads.flatMap((u) =>
        u.status === "ready" && u.uploadId && u.uploadedFor === accountId ? [u.uploadId] : [],
      )
    : [];
  return {
    accountId,
    ...(reply ? { replyToGmailMessageId: message.gmailMessageId } : {}),
    to: fields.to,
    cc: fields.cc,
    bcc: fields.bcc,
    subject: fields.subject,
    body: fields.body,
    ...(ownSender && fields.fromAlias ? { from: fields.fromAlias } : {}),
    ...(uploadIds.length > 0 ? { uploadIds } : {}),
    ...(reply ? quoteFields(fields.quotedText) : {}),
  };
};

/**
 * The compose window's autosave into Gmail drafts (the footer's "Saving
 * draft…" / "Saved to Gmail drafts · 10:41").
 *
 * Debounced on what the draft is made of. The first save creates the draft and
 * every later one names its id, so pausing ten times leaves one draft, not ten.
 * A send waits for a save already in flight (`flush`) so the id it hands the
 * server — which deletes the draft once the mail is out — is the real one. A
 * change of mailbox moves the draft: the old one is deleted and the next save
 * creates it where the mail now goes from.
 */
export function useDraftAutosave({ session, enabled, worthSaving, delayMs, update }: Options) {
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [draftId, setDraftId] = useState<string | null>(session.fields.draftId);
  const draftRef = useRef<{ id: string; accountId: string } | null>(
    session.fields.draftId
      ? { id: session.fields.draftId, accountId: draftRequest(session).accountId }
      : null,
  );
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string | null>(null);
  const stopped = useRef(false);

  const payload = JSON.stringify(draftRequest(session));

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const save = useCallback(
    (snapshot: string) => {
      const run = async () => {
        setStatus("saving");
        try {
          const request = JSON.parse(snapshot) as Omit<SaveDraftInput, "draftId">;
          const previous = draftRef.current;
          if (previous && previous.accountId !== request.accountId) {
            draftRef.current = null;
            void deleteDraft(previous.accountId, previous.id).catch(() => {});
          }
          const result = await saveDraft({ ...request, draftId: draftRef.current?.id });
          draftRef.current = { id: result.draftId, accountId: request.accountId };
          setDraftId(result.draftId);
          update({ draftId: result.draftId });
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
    [update],
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
    return draftRef.current?.id;
  }, []);

  /** Discarding: stop saving, and take the draft out of Gmail too. */
  const discard = useCallback(async () => {
    stopped.current = true;
    clearTimer();
    await inFlight.current;
    const draft = draftRef.current;
    if (draft) await deleteDraft(draft.accountId, draft.id).catch(() => {});
  }, []);

  return { status, savedAt, draftId, flush, discard };
}
