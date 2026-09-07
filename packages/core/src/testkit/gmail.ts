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
import type { GmailDataAdapter } from "../google/gmailAdapter";
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

export interface RecordingGmail {
  readonly adapter: GmailDataAdapter;
  /** Every `batchModifyLabels`, in order. */
  readonly modifications: ModifyCall[];
  readonly archived: ThreadCall[];
  readonly trashed: ThreadCall[];
  /** Every label Gmail was asked to create, in order. */
  readonly createdLabels: string[];
  /** Set to fail the next Gmail call the way a rejected request does. */
  fails: Error | null;
}

const unused = (method: string) => () => {
  throw new Error(`${method} is not part of the flow under test`);
};

export function makeRecordingGmail(options?: {
  /** What `createLabel` answers with, by name. Defaults are derived from it. */
  createLabel?: (name: string) => GogLabelT;
}): RecordingGmail {
  const recording = {
    modifications: [] as ModifyCall[],
    archived: [] as ThreadCall[],
    trashed: [] as ThreadCall[],
    createdLabels: [] as string[],
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
    searchMessages: unused("searchMessages"),
    getMessage: unused("getMessage"),
    sendReply: unused("sendReply"),
    listFilters: unused("listFilters"),
    createFilter: unused("createFilter"),
    deleteFilter: unused("deleteFilter"),
    getAttachment: unused("getAttachment"),
  };

  return Object.assign(recording, { adapter });
}
