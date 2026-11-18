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
  GmailThreads,
  type AccountRef,
} from "./contracts";
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
}
export interface AttachmentBytes {
  data: Uint8Array;
  size: number;
}

/** Find the original message's threadId + Message-ID header for threading. */
function threadingFor(ref: AccountRef, messageId: string) {
  return GmailMessages.use((svc) => svc.get(ref, messageId));
}

/** Extract the `Message-ID` header (for In-Reply-To/References) from a raw msg. */
function messageIdHeader(msg: GogMessageRawT): string | undefined {
  const headers = msg.payload?.headers ?? [];
  const h = headers.find((x) => x.name.toLowerCase() === "message-id");
  return h?.value;
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
      const original = await runWithApp(threadingFor(ref(o.account), o.replyToMessageId));
      return runWithApp(
        GmailMessages.use((svc) =>
          svc.send(ref(o.account), {
            ...outgoing(o),
            replyToMessageId: o.replyToMessageId,
            threadId: original.threadId,
            inReplyToHeader: messageIdHeader(original),
          }),
        ),
      );
    },
    sendNew: (o) => runWithApp(GmailMessages.use((svc) => svc.send(ref(o.account), outgoing(o)))),
    saveDraft: async (o) => {
      const replyTo = o.replyToMessageId;
      const original = replyTo
        ? await runWithApp(threadingFor(ref(o.account), replyTo))
        : undefined;
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
                    inReplyToHeader: messageIdHeader(original),
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
