/**
 * Promise-facade adapter over the Effect Gmail services.
 *
 * The business services (labels, filters, apply, reply, sync) were written
 * against the old gog adapter's promise interface, keyed by `{ account: email }`.
 * This adapter exposes the same method names and shapes but routes each call
 * through the new Effect services (provided `AppLive` via `runWithApp`), so those
 * services swap backends by changing only their default factory + import — not
 * their call sites. The old gog-auth-only methods (listAccounts, getProfile,
 * reauth, addAccount) are intentionally absent; they're handled by the OAuth
 * flow now.
 */
import {
  GmailDrafts,
  GmailFilters,
  GmailLabels,
  GmailMessages,
  GmailModify,
  GmailProfile,
  GmailThreads,
  type AccountRef,
  type MessageMetadata,
  type SendAsAlias,
} from "./contracts";
import type { MimeAttachment } from "./rfc822";
import { runWithApp } from "./runtime";
import type { GogFilterT, GogLabelT, GogMessageRawT } from "../schemas/gmail";

export interface SearchHit {
  messageId: string;
  threadId: string;
}
export interface SendResult {
  messageId: string;
  /** The thread the sent message is in — what a "View in Gmail" link needs. */
  threadId: string;
}
export interface SavedDraft {
  draftId: string;
  messageId: string;
  threadId: string;
}

/** What every outgoing message carries, reply or not. */
export interface OutgoingMessage {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  /** An HTML alternative of the body. */
  html?: string;
  /** The From header, formatted — a send-as alias; absent is the account's address. */
  from?: string;
  attachments?: MimeAttachment[];
  /** A Message-ID of miel's own, written instead of Gmail's. */
  messageId?: string;
}

/** How a message hangs off a conversation: Gmail's thread, and the RFC threading header. */
export interface Threading {
  /** Gmail's thread id — only meaningful in the mailbox it came from. */
  threadId?: string;
  /** The original's Message-ID, for In-Reply-To/References. */
  inReplyTo?: string;
}

export type { MessageMetadata, SendAsAlias };
export interface AttachmentBytes {
  data: Uint8Array;
  size: number;
}

/**
 * The original message's threadId + Message-ID header, for threading — read as
 * metadata, since a reply needs two headers and none of the body.
 */
async function threadingFor(
  ref: AccountRef,
  messageId: string,
): Promise<{ threadId: string; inReplyTo: string | undefined }> {
  const meta = await runWithApp(
    GmailMessages.use((svc) => svc.metadata(ref, messageId, ["Message-ID"])),
  );
  return { threadId: meta.threadId, inReplyTo: meta.headers["message-id"] };
}

export interface GmailDataAdapter {
  searchMessages(o: { account: string; query: string; max?: number }): Promise<SearchHit[]>;
  getMessage(o: { account: string; messageId: string }): Promise<GogMessageRawT>;
  listLabels(o: { account: string }): Promise<GogLabelT[]>;
  createLabel(o: { account: string; name: string }): Promise<GogLabelT>;
  batchModifyLabels(o: {
    account: string;
    messageIds: string[];
    add?: string[];
    remove?: string[];
  }): Promise<void>;
  trashThread(o: { account: string; threadId: string }): Promise<void>;
  archiveThread(o: { account: string; threadId: string }): Promise<void>;
  unarchiveThread(o: { account: string; threadId: string }): Promise<void>;
  untrashThread(o: { account: string; threadId: string }): Promise<void>;
  sendReply(
    o: OutgoingMessage & { account: string; replyToMessageId: string },
  ): Promise<SendResult>;
  /** A message that answers nothing: no thread, no threading headers. */
  sendNew(o: OutgoingMessage & { account: string }): Promise<SendResult>;
  /**
   * The general send: a message with whatever threading the caller resolved —
   * a forward, or a reply sent from a different mailbox than the one it
   * arrived in (no thread id there: it belongs to the other mailbox).
   */
  sendThreaded(o: OutgoingMessage & { account: string; threading: Threading }): Promise<SendResult>;
  /** The threading a reply to this message needs: its thread and its Message-ID. */
  threadingOf(o: { account: string; messageId: string }): Promise<Required<Threading>>;
  /** One message's named headers, without its body. */
  getMessageHeaders(o: {
    account: string;
    messageId: string;
    headers: readonly string[];
  }): Promise<MessageMetadata>;
  /** The addresses the account may send as. */
  listSendAs(o: { account: string }): Promise<SendAsAlias[]>;
  /**
   * Create a draft, or replace the one `draftId` names. A reply draft names the
   * message it answers, and is threaded the way the send would be.
   */
  saveDraft(
    o: OutgoingMessage & { account: string; draftId?: string; replyToMessageId?: string },
  ): Promise<SavedDraft>;
  deleteDraft(o: { account: string; draftId: string }): Promise<void>;
  listFilters(o: { account: string }): Promise<GogFilterT[]>;
  createFilter(o: {
    account: string;
    from?: string;
    to?: string;
    subject?: string;
    query?: string;
    addLabel?: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
    forward?: string;
  }): Promise<GogFilterT>;
  deleteFilter(o: { account: string; filterId: string }): Promise<void>;
  getAttachment(o: {
    account: string;
    messageId: string;
    attachmentId: string;
  }): Promise<AttachmentBytes>;
}

const ref = (account: string): AccountRef => ({ email: account });

/** The address lists, subject and body, without the adapter's `account`. */
const outgoing = (o: OutgoingMessage): OutgoingMessage => ({
  to: o.to,
  cc: o.cc,
  bcc: o.bcc,
  subject: o.subject,
  body: o.body,
  ...(o.html !== undefined ? { html: o.html } : {}),
  ...(o.from !== undefined ? { from: o.from } : {}),
  ...(o.attachments && o.attachments.length > 0 ? { attachments: o.attachments } : {}),
  ...(o.messageId !== undefined ? { messageId: o.messageId } : {}),
});

export function createGmailAdapter(): GmailDataAdapter {
  return {
    searchMessages: (o) =>
      runWithApp(GmailMessages.use((svc) => svc.search(ref(o.account), o.query, o.max))),
    getMessage: (o) => runWithApp(GmailMessages.use((svc) => svc.get(ref(o.account), o.messageId))),
    listLabels: (o) => runWithApp(GmailLabels.use((svc) => svc.list(ref(o.account)))),
    createLabel: (o) => runWithApp(GmailLabels.use((svc) => svc.create(ref(o.account), o.name))),
    batchModifyLabels: (o) =>
      runWithApp(
        GmailModify.use((svc) => svc.batch(ref(o.account), o.messageIds, o.add, o.remove)),
      ),
    trashThread: (o) =>
      runWithApp(GmailThreads.use((svc) => svc.trash(ref(o.account), o.threadId))),
    archiveThread: (o) =>
      runWithApp(GmailThreads.use((svc) => svc.archive(ref(o.account), o.threadId))),
    unarchiveThread: (o) =>
      runWithApp(GmailThreads.use((svc) => svc.unarchive(ref(o.account), o.threadId))),
    untrashThread: (o) =>
      runWithApp(GmailThreads.use((svc) => svc.untrash(ref(o.account), o.threadId))),
    // Fetch the original first for its threadId + Message-ID header so the
    // reply threads correctly, then send.
    sendReply: async (o) => {
      const original = await threadingFor(ref(o.account), o.replyToMessageId);
      return runWithApp(
        GmailMessages.use((svc) =>
          svc.send(ref(o.account), {
            ...outgoing(o),
            replyToMessageId: o.replyToMessageId,
            threadId: original.threadId,
            inReplyToHeader: original.inReplyTo,
          }),
        ),
      );
    },
    sendNew: (o) => runWithApp(GmailMessages.use((svc) => svc.send(ref(o.account), outgoing(o)))),
    sendThreaded: (o) =>
      runWithApp(
        GmailMessages.use((svc) =>
          svc.send(ref(o.account), {
            ...outgoing(o),
            ...(o.threading.threadId ? { threadId: o.threading.threadId } : {}),
            ...(o.threading.inReplyTo ? { inReplyToHeader: o.threading.inReplyTo } : {}),
          }),
        ),
      ),
    threadingOf: async (o) => {
      const t = await threadingFor(ref(o.account), o.messageId);
      return { threadId: t.threadId, inReplyTo: t.inReplyTo ?? "" };
    },
    getMessageHeaders: (o) =>
      runWithApp(GmailMessages.use((svc) => svc.metadata(ref(o.account), o.messageId, o.headers))),
    listSendAs: (o) => runWithApp(GmailProfile.use((svc) => svc.sendAs(ref(o.account)))),
    saveDraft: async (o) => {
      const replyTo = o.replyToMessageId;
      const original = replyTo ? await threadingFor(ref(o.account), replyTo) : undefined;
      return runWithApp(
        GmailDrafts.use((svc) =>
          svc.save(ref(o.account), {
            draftId: o.draftId,
            message: {
              ...outgoing(o),
              ...(original
                ? {
                    replyToMessageId: replyTo,
                    threadId: original.threadId,
                    inReplyToHeader: original.inReplyTo,
                  }
                : {}),
            },
          }),
        ),
      );
    },
    deleteDraft: (o) => runWithApp(GmailDrafts.use((svc) => svc.delete(ref(o.account), o.draftId))),
    listFilters: (o) => runWithApp(GmailFilters.use((svc) => svc.list(ref(o.account)))),
    createFilter: (o) =>
      runWithApp(
        GmailFilters.use((svc) =>
          svc.create(ref(o.account), {
            from: o.from,
            to: o.to,
            subject: o.subject,
            query: o.query,
            addLabelId: o.addLabel,
            addLabelIds: o.addLabelIds,
            removeLabelIds: o.removeLabelIds,
            forward: o.forward,
          }),
        ),
      ),
    deleteFilter: (o) =>
      runWithApp(GmailFilters.use((svc) => svc.delete(ref(o.account), o.filterId))),
    getAttachment: (o) =>
      runWithApp(
        GmailMessages.use((svc) => svc.getAttachment(ref(o.account), o.messageId, o.attachmentId)),
      ),
  };
}
