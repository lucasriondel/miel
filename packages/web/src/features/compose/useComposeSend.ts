import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  forwardMessageMutationOptions,
  scheduleSendMutationOptions,
  sendNewMessageMutationOptions,
  type ScheduleSendInput,
} from "../../api/compose.hooks";
import { sendReplyMutationOptions, useArchiveMessage } from "../../api/mutations";
import { quoteFields } from "../reply/quoteText";
import type { ComposeSession } from "./composeSession";
import { looksLikeAddress } from "./recipients";
import { overAttachmentLimit } from "./useAttachmentUploads";

export interface SentRecord {
  at: Date;
  threadId: string;
  archived: boolean;
}

export interface ScheduledRecord {
  id: string;
  sendAt: Date;
}

/**
 * Why Send is off, in the words the footer shows — or null when it is on. A
 * disabled control that does not say why reads as broken. Files still
 * uploading do not turn it off: a send waits for them.
 */
export const sendBlocker = (session: ComposeSession, originalBytes = 0): string | null => {
  const { fields, kind } = session;
  const all = [...fields.to, ...fields.cc, ...fields.bcc];
  if (fields.to.length === 0) return "Add a recipient to send";
  if (all.some((entry) => !looksLikeAddress(entry))) return "Fix the address in red to send";
  // A forward's content is the message it carries; a line of one's own is optional.
  if (kind !== "forward" && fields.body.trim().length === 0) return "Write a message to send";
  if ((kind === "reply" || kind === "replyAll") && fields.subject.trim().length === 0) {
    return "Add a subject to send";
  }
  if (overAttachmentLimit(fields.uploads, originalBytes)) {
    return "Attachments are over Gmail's 25 MB — remove one to send";
  }
  return null;
};

/** The words of the sent confirmation: who it went to, by name where one is known. */
export const sentToLabel = (session: ComposeSession): string => {
  const first = session.fields.to[0] ?? "";
  const name = session.names[first.toLowerCase()] ?? first;
  const others = session.fields.to.length - 1 + session.fields.cc.length;
  return others > 0 ? `${name} and ${others} more` : name;
};

interface Options {
  session: ComposeSession;
  /** Waits for a draft save in flight and answers its id. */
  flushDraft: () => Promise<string | undefined>;
  /** Waits for files still uploading and answers the staged ids in chip order. */
  waitForUploads: () => Promise<string[]>;
  /** A forward's original files still on the window, or null before they are known. */
  keptAttachmentIds: string[] | null;
  /** Their size, which counts against Gmail's limit with the uploads. */
  keptAttachmentBytes: number;
}

/** Omitted rather than empty, the way the request factories treat lists. */
const lists = (session: ComposeSession) => ({
  ...(session.fields.cc.length > 0 ? { cc: session.fields.cc } : {}),
  ...(session.fields.bcc.length > 0 ? { bcc: session.fields.bcc } : {}),
});

const isReply = (session: ComposeSession) =>
  (session.kind === "reply" || session.kind === "replyAll") && session.message !== null;

/**
 * Sending, for every kind of window, now or later. A reply and a reply-all go
 * through `send-reply` (which quotes the original itself — the window never
 * types a quote into the body), a forward through `forward` (which carries the
 * original's block and files), a new mail through `/compose/send`. Schedule
 * send hands the same request to `/compose/scheduled` with a time.
 *
 * Send & archive is a reply's: the message answered leaves the inbox through
 * the same archive mutation every other caller uses, once Gmail has accepted
 * the reply and not before.
 */
export function useComposeSend({
  session,
  flushDraft,
  waitForUploads,
  keptAttachmentIds,
  keptAttachmentBytes,
}: Options) {
  const qc = useQueryClient();
  const archive = useArchiveMessage();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState<SentRecord | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledRecord | null>(null);
  const blocker = sendBlocker(session, keptAttachmentBytes);
  const done = sent !== null || scheduled !== null;
  const { fields, kind, message } = session;
  const from = fields.fromAlias ?? undefined;

  const prepare = useCallback(async () => {
    const draftId = await flushDraft();
    const uploadIds = await waitForUploads();
    return { draftId, uploadIds };
  }, [flushDraft, waitForUploads]);

  const send = useCallback(
    async (andArchive: boolean) => {
      if (sending || done || blocker !== null) return;
      setSending(true);
      setError(null);
      try {
        const { draftId, uploadIds } = await prepare();
        const common = { ...lists(session), from, uploadIds, draftId };
        const answered = isReply(session) ? message : null;
        const result =
          answered !== null
            ? await sendReplyMutationOptions(qc).mutationFn({
                accountId: answered.accountId,
                gmailMessageId: answered.gmailMessageId,
                subject: fields.subject,
                body: fields.body,
                to: fields.to,
                ...common,
                ...(kind === "replyAll" ? { replyAll: true } : {}),
                ...(fields.fromAccountId !== answered.accountId
                  ? { fromAccountId: fields.fromAccountId }
                  : {}),
                ...quoteFields(fields.quotedText),
              })
            : kind === "forward" && message
              ? await forwardMessageMutationOptions(qc).mutationFn({
                  accountId: message.accountId,
                  gmailMessageId: message.gmailMessageId,
                  to: fields.to,
                  subject: fields.subject,
                  body: fields.body,
                  keepAttachmentIds: keptAttachmentIds ?? [],
                  ...common,
                })
              : await sendNewMessageMutationOptions(qc).mutationFn({
                  accountId: fields.fromAccountId,
                  to: fields.to,
                  subject: fields.subject,
                  body: fields.body,
                  ...common,
                });
        const archived = Boolean(andArchive && answered);
        if (archived && answered) {
          archive.mutate({
            accountId: answered.accountId,
            gmailMessageId: answered.gmailMessageId,
          });
        }
        void qc.invalidateQueries({ queryKey: ["messages"] });
        setSent({ at: new Date(), threadId: result.threadId, archived });
      } catch (err) {
        setError(err);
      } finally {
        setSending(false);
      }
    },
    [
      sending,
      done,
      blocker,
      prepare,
      session,
      from,
      message,
      qc,
      fields,
      kind,
      keptAttachmentIds,
      archive,
    ],
  );

  /**
   * Schedule send. Only a mail that goes from the mailbox its window belongs to
   * can be held: a reply answered from another mailbox is threaded by headers
   * read at send time, which the scheduled route does not take.
   */
  const canSchedule = !isReply(session) || fields.fromAccountId === message?.accountId;

  const schedule = useCallback(
    async (sendAt: Date): Promise<ScheduledRecord | null> => {
      if (sending || done || blocker !== null || !canSchedule) return null;
      setSending(true);
      setError(null);
      try {
        const { draftId, uploadIds } = await prepare();
        const input: ScheduleSendInput = {
          accountId: message && kind !== "new" ? message.accountId : fields.fromAccountId,
          kind: kind === "new" ? "new" : kind === "forward" ? "forward" : "reply",
          ...(message && kind !== "new" ? { sourceGmailMessageId: message.gmailMessageId } : {}),
          sendAt,
          to: fields.to,
          ...lists(session),
          subject: fields.subject,
          body: fields.body,
          from,
          uploadIds,
          draftId,
          ...(kind === "forward" ? { keepAttachmentIds: keptAttachmentIds ?? [] } : {}),
          ...(kind === "replyAll" ? { replyAll: true } : {}),
          ...(isReply(session) ? quoteFields(fields.quotedText) : {}),
        };
        const created = await scheduleSendMutationOptions(qc).mutationFn(input);
        const record = { id: created.id, sendAt: new Date(created.sendAt) };
        setScheduled(record);
        return record;
      } catch (err) {
        setError(err);
        return null;
      } finally {
        setSending(false);
      }
    },
    [
      sending,
      done,
      blocker,
      canSchedule,
      prepare,
      message,
      kind,
      fields,
      session,
      from,
      keptAttachmentIds,
      qc,
    ],
  );

  return { send, schedule, canSchedule, sending, error, sent, scheduled, blocker };
}
