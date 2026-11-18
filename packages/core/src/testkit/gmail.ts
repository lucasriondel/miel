/**
 * A recording `GmailDataAdapter` for the message-action suites (#136).
 *
 * Every message action is "tell Gmail, then write it down", and the order
 * matters: a modification Gmail refuses must leave nothing written locally. So
 * the fake records what it was asked to do, and can be told to refuse — which
 * is the only way to test that ordering without a Gmail account.
 *
 * Methods no message action uses throw rather than answering emptily: a suite
 * that reaches one has strayed out of the flow it is describing.
 */
import type {
  GmailDataAdapter,
  MessageMetadata,
  OutgoingMessage,
  SendAsAlias,
  Threading,
} from "../google/gmailAdapter";
import type { GogLabelT } from "../schemas/gmail";

export interface ModifyCall {
  account: string;
  messageIds: string[];
  add?: string[];
  remove?: string[];
}

export interface ThreadCall {
  account: string;
  threadId: string;
}

/**
 * A send as the adapter was asked for it; `replyToMessageId` marks a reply made
 * through `sendReply`, `threading` one made through `sendThreaded`.
 */
export interface SendCall extends OutgoingMessage {
  account: string;
  replyToMessageId?: string;
  threading?: Threading;
}

export interface DraftCall extends OutgoingMessage {
  account: string;
  draftId?: string;
  replyToMessageId?: string;
}

export interface RecordingGmail {
  readonly adapter: GmailDataAdapter;
  /** Every `batchModifyLabels`, in order. */
  readonly modifications: ModifyCall[];
  readonly archived: ThreadCall[];
  readonly trashed: ThreadCall[];
  readonly unarchived: ThreadCall[];
  readonly untrashed: ThreadCall[];
  /** Every label Gmail was asked to create, in order. */
  readonly createdLabels: string[];
  /** Every send, reply or new, in order. Each answers `sent-<n>` in `thread-<n>`. */
  readonly sent: SendCall[];
  /** Every draft save; a new one answers `draft-<n>`. */
  readonly savedDrafts: DraftCall[];
  readonly deletedDrafts: { account: string; draftId: string }[];
  /** Every search query, in order. */
  readonly searches: string[];
  /** Set to fail the next Gmail call the way a rejected request does. */
  fails: Error | null;
}

const unused = (method: string) => () => {
  throw new Error(`${method} is not part of the flow under test`);
};

export function makeRecordingGmail(options?: {
  /** What `createLabel` answers with, by name. Defaults are derived from it. */
  createLabel?: (name: string) => GogLabelT;
  /** What `listSendAs` answers; defaults to the account's own address only. */
  sendAs?: SendAsAlias[];
  /** Attachment bytes by Gmail attachment id, for forwards. */
  attachments?: Record<string, Uint8Array>;
  /** Header reads (contacts harvest) and search hits, by message id. */
  headers?: Record<string, MessageMetadata>;
  search?: (query: string) => { messageId: string; threadId: string }[];
}): RecordingGmail {
  const recording = {
    modifications: [] as ModifyCall[],
    archived: [] as ThreadCall[],
    trashed: [] as ThreadCall[],
    unarchived: [] as ThreadCall[],
    untrashed: [] as ThreadCall[],
    createdLabels: [] as string[],
    sent: [] as SendCall[],
    savedDrafts: [] as DraftCall[],
    deletedDrafts: [] as { account: string; draftId: string }[],
    searches: [] as string[],
    fails: null as Error | null,
  };

  const orFail = async () => {
    if (recording.fails) throw recording.fails;
  };

  const adapter: GmailDataAdapter = {
    batchModifyLabels: async (o) => {
      await orFail();
      recording.modifications.push(o);
    },
    archiveThread: async (o) => {
      await orFail();
      recording.archived.push(o);
    },
    trashThread: async (o) => {
      await orFail();
      recording.trashed.push(o);
    },
    unarchiveThread: async (o) => {
      await orFail();
      recording.unarchived.push(o);
    },
    untrashThread: async (o) => {
      await orFail();
      recording.untrashed.push(o);
    },
    createLabel: async (o) => {
      await orFail();
      recording.createdLabels.push(o.name);
      return (
        options?.createLabel?.(o.name) ?? {
          id: `Gmail_${o.name}`,
          name: o.name,
          type: "user",
        }
      );
    },
    listLabels: async () => {
      await orFail();
      return [];
    },
    searchMessages: options?.search
      ? async (o) => {
          await orFail();
          recording.searches.push(o.query);
          return options.search!(o.query);
        }
      : unused("searchMessages"),
    getMessage: unused("getMessage"),
    sendReply: async (o) => {
      await orFail();
      recording.sent.push(o);
      const n = recording.sent.length;
      return { messageId: `sent-${n}`, threadId: `thread-of-${o.replyToMessageId}` };
    },
    sendNew: async (o) => {
      await orFail();
      recording.sent.push(o);
      const n = recording.sent.length;
      return { messageId: `sent-${n}`, threadId: `thread-${n}` };
    },
    saveDraft: async (o) => {
      await orFail();
      recording.savedDrafts.push(o);
      const draftId = o.draftId ?? `draft-${recording.savedDrafts.length}`;
      return { draftId, messageId: `draft-msg-${recording.savedDrafts.length}`, threadId: "t" };
    },
    deleteDraft: async (o) => {
      await orFail();
      recording.deletedDrafts.push(o);
    },
    listFilters: unused("listFilters"),
    createFilter: unused("createFilter"),
    deleteFilter: unused("deleteFilter"),
    getAttachment: options?.attachments
      ? async (o) => {
          await orFail();
          const data = options.attachments![o.attachmentId];
          if (!data) throw new Error(`no attachment ${o.attachmentId}`);
          return { data, size: data.byteLength };
        }
      : unused("getAttachment"),
    sendThreaded: async (o) => {
      await orFail();
      recording.sent.push(o);
      const n = recording.sent.length;
      return { messageId: `sent-${n}`, threadId: o.threading.threadId ?? `thread-${n}` };
    },
    threadingOf: async (o) => {
      await orFail();
      return { threadId: `gmail-thread-of-${o.messageId}`, inReplyTo: `<${o.messageId}@mail>` };
    },
    getMessageHeaders: options?.headers
      ? async (o) => {
          await orFail();
          const meta = options.headers![o.messageId];
          if (!meta) throw new Error(`no headers for ${o.messageId}`);
          return meta;
        }
      : unused("getMessageHeaders"),
    listSendAs: async (o) => {
      await orFail();
      return (
        options?.sendAs ?? [
          { email: o.account, displayName: null, isPrimary: true, isDefault: true, verified: true },
        ]
      );
    },
  };

  return Object.assign(recording, { adapter });
}
