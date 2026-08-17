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
}
export interface AttachmentBytes {
  data: Uint8Array;
  size: number;
}

/** Find the original message's threadId + Message-ID header for threading. */
function threadingFor(ref: AccountRef, messageId: string) {
  return GmailMessages.get(ref, messageId);
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
  sendReply(o: {
    account: string;
    to: string[];
    cc?: string[];
    subject: string;
    body: string;
    replyToMessageId: string;
  }): Promise<SendResult>;
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

export function createGmailAdapter(): GmailDataAdapter {
  return {
    searchMessages: (o) => runWithApp(GmailMessages.search(ref(o.account), o.query, o.max)),
    getMessage: (o) => runWithApp(GmailMessages.get(ref(o.account), o.messageId)),
    listLabels: (o) => runWithApp(GmailLabels.list(ref(o.account))),
    createLabel: (o) => runWithApp(GmailLabels.create(ref(o.account), o.name)),
    batchModifyLabels: (o) =>
      runWithApp(GmailModify.batch(ref(o.account), o.messageIds, o.add, o.remove)),
    trashThread: (o) => runWithApp(GmailThreads.trash(ref(o.account), o.threadId)),
    archiveThread: (o) => runWithApp(GmailThreads.archive(ref(o.account), o.threadId)),
    // Fetch the original first for its threadId + Message-ID header so the
    // reply threads correctly, then send.
    sendReply: async (o) => {
      const original = await runWithApp(threadingFor(ref(o.account), o.replyToMessageId));
      return runWithApp(
        GmailMessages.send(ref(o.account), {
          to: o.to,
          cc: o.cc,
          subject: o.subject,
          body: o.body,
          replyToMessageId: o.replyToMessageId,
          threadId: original.threadId,
          inReplyToHeader: messageIdHeader(original),
        }),
      );
    },
    listFilters: (o) => runWithApp(GmailFilters.list(ref(o.account))),
    createFilter: (o) =>
      runWithApp(
        GmailFilters.create(ref(o.account), {
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
    deleteFilter: (o) => runWithApp(GmailFilters.delete(ref(o.account), o.filterId)),
    getAttachment: (o) =>
      runWithApp(GmailMessages.getAttachment(ref(o.account), o.messageId, o.attachmentId)),
  };
}
