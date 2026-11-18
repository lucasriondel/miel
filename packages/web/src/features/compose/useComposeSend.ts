import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sendNewMessageMutationOptions } from "../../api/compose.hooks";
import { sendReplyMutationOptions, useArchiveMessage } from "../../api/mutations";
import type { ComposeSession } from "./composeSession";
import { looksLikeAddress } from "./recipients";

export interface SentRecord {
  at: Date;
  threadId: string;
  archived: boolean;
}

/**
 * Why Send is off, in the words the footer shows — or null when it is on. A
 * disabled control that does not say why reads as broken.
 */
export const sendBlocker = (session: ComposeSession): string | null => {
  const { fields, kind } = session;
  const all = [...fields.to, ...fields.cc, ...fields.bcc];
  if (fields.to.length === 0) return "Add a recipient to send";
  if (all.some((entry) => !looksLikeAddress(entry))) return "Fix the address in red to send";
  if (fields.body.trim().length === 0) return "Write a message to send";
  if ((kind === "reply" || kind === "replyAll") && fields.subject.trim().length === 0) {
    return "Add a subject to send";
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
}

/**
 * Sending, for every kind of window. A reply and a reply-all go into the
 * answered message's thread through `send-reply`; a new mail and a forward go
 * out through `/compose/send` with no thread — a forward is a new message that
 * happens to quote one.
 *
 * Send & archive is a reply's: the message answered leaves the inbox through
 * the same archive mutation every other caller uses, once Gmail has accepted
 * the reply and not before.
 */
export function useComposeSend({ session, flushDraft }: Options) {
  const qc = useQueryClient();
  const archive = useArchiveMessage();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState<SentRecord | null>(null);

  const send = useCallback(
    async (andArchive: boolean) => {
      if (sending || sent || sendBlocker(session) !== null) return;
      const { fields, kind, message } = session;
      setSending(true);
      setError(null);
      try {
        const draftId = await flushDraft();
        const lists = {
          ...(fields.cc.length > 0 ? { cc: fields.cc } : {}),
          ...(fields.bcc.length > 0 ? { bcc: fields.bcc } : {}),
        };
        const answered = kind === "reply" || kind === "replyAll" ? message : null;
        const result = answered
          ? await sendReplyMutationOptions(qc).mutationFn({
              accountId: answered.accountId,
              gmailMessageId: answered.gmailMessageId,
              subject: fields.subject,
              body: fields.body,
              to: fields.to,
              ...lists,
              ...(kind === "replyAll" ? { replyAll: true } : {}),
              ...(draftId ? { draftId } : {}),
            })
          : await sendNewMessageMutationOptions(qc).mutationFn({
              accountId: session.accountId,
              to: fields.to,
              ...lists,
              subject: fields.subject,
              body: fields.body,
              ...(draftId ? { draftId } : {}),
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
    [sending, sent, session, flushDraft, qc, archive],
  );

  return { send, sending, error, sent, blocker: sendBlocker(session) };
}
