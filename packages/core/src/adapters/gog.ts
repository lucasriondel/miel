import { getEnv } from "../env";
import {
  GogAuthList,
  GogCreateLabelResponse,
  GogLabelListResponse,
  GogMessage,
  GogSearchResponse,
  GogSendResponse,
  type GogAccountT,
  type GogLabelT,
  type GogMessageT,
} from "../schemas/gmail";
import { spawnJson, spawnVoid } from "./shell";

export interface SearchHit {
  messageId: string;
  threadId: string;
}

export interface SendResult {
  messageId: string;
}

export interface GogAdapter {
  listAccounts(): Promise<GogAccountT[]>;
  searchMessages(o: {
    account: string;
    query: string;
    max?: number;
  }): Promise<SearchHit[]>;
  getMessage(o: { account: string; messageId: string }): Promise<GogMessageT>;
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
    subject: string;
    body: string;
    replyToMessageId: string;
  }): Promise<SendResult>;
}

function bin(): string {
  return getEnv().GOG_BIN;
}

function unwrapGetMessageResponse(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  const inner = obj.message;
  if (!inner || typeof inner !== "object") return raw;

  // gog returns { body, headers: {subject,from,to,...}, message: {id, threadId, payload, ...} }
  // Merge the outer decoded view onto the inner raw payload so both shapes are usable downstream.
  const innerObj = inner as Record<string, unknown>;
  const headers = (obj.headers ?? undefined) as
    | Record<string, string>
    | undefined;
  const lifted: Record<string, unknown> = { ...innerObj };
  if (typeof obj.body === "string") lifted.body = obj.body;
  if (headers && typeof headers === "object") {
    lifted.headers = headers;
    if (typeof headers.subject === "string") lifted.subject = headers.subject;
    if (typeof headers.from === "string") lifted.from = headers.from;
    if (typeof headers.to === "string") lifted.to = headers.to;
    if (typeof headers.cc === "string") lifted.cc = headers.cc;
    if (typeof headers.date === "string") lifted.date = headers.date;
  }
  return lifted;
}

function normalizeSearchHits(
  parsed: unknown,
): { messageId: string; threadId: string }[] {
  const hits: { messageId: string; threadId: string }[] = [];
  const rows = Array.isArray(parsed)
    ? parsed
    : ((parsed as { threads?: unknown[]; messages?: unknown[] }).threads ??
      (parsed as { threads?: unknown[]; messages?: unknown[] }).messages ??
      []);
  for (const row of rows as Array<Record<string, unknown>>) {
    const id = (row.id as string) ?? "";
    const threadId =
      (row.threadId as string) ?? (row.thread_id as string) ?? id;
    if (id) hits.push({ messageId: id, threadId });
  }
  return hits;
}

export function createGogAdapter(): GogAdapter {
  return {
    async listAccounts() {
      const raw = await spawnJson({ cmd: [bin(), "auth", "list", "--json"] });
      return GogAuthList.parse(raw).accounts;
    },

    async searchMessages({ account, query, max = 50 }) {
      const raw = await spawnJson({
        cmd: [
          bin(),
          "--account",
          account,
          "--json",
          "gmail",
          "messages",
          "search",
          query,
          `--max=${max}`,
        ],
      });
      GogSearchResponse.parse(raw);
      return normalizeSearchHits(raw);
    },

    async getMessage({ account, messageId }) {
      const raw = await spawnJson({
        cmd: [
          bin(),
          "--account",
          account,
          "--json",
          "gmail",
          "get",
          messageId,
          "--format=full",
        ],
      });
      return GogMessage.parse(unwrapGetMessageResponse(raw));
    },

    async listLabels({ account }) {
      const raw = await spawnJson({
        cmd: [bin(), "--account", account, "--json", "gmail", "labels", "list"],
      });
      const parsed = GogLabelListResponse.parse(raw);
      return Array.isArray(parsed) ? parsed : parsed.labels;
    },

    async createLabel({ account, name }) {
      const raw = await spawnJson({
        cmd: [
          bin(),
          "--account",
          account,
          "--json",
          "gmail",
          "labels",
          "create",
          name,
        ],
      });
      return GogCreateLabelResponse.parse(raw);
    },

    async batchModifyLabels({ account, messageIds, add, remove }) {
      if (messageIds.length === 0) return;
      const cmd = [
        bin(),
        "--account",
        account,
        "--json",
        "--force",
        "gmail",
        "batch",
        "modify",
        ...messageIds,
      ];
      if (add && add.length > 0) cmd.push(`--add=${add.join(",")}`);
      if (remove && remove.length > 0) cmd.push(`--remove=${remove.join(",")}`);
      await spawnVoid({ cmd });
    },

    async trashThread({ account, threadId }) {
      await spawnVoid({
        cmd: [
          bin(),
          "--account",
          account,
          "--json",
          "--force",
          "gmail",
          "thread",
          "modify",
          threadId,
          "--add=TRASH",
          "--remove=INBOX",
        ],
      });
    },

    async archiveThread({ account, threadId }) {
      await spawnVoid({
        cmd: [
          bin(),
          "--account",
          account,
          "--json",
          "--force",
          "gmail",
          "thread",
          "modify",
          threadId,
          "--remove=INBOX",
        ],
      });
    },

    async sendReply({ account, to, subject, body, replyToMessageId }) {
      const raw = await spawnJson({
        cmd: [
          bin(),
          "--account",
          account,
          "--json",
          "gmail",
          "send",
          `--to=${to.join(",")}`,
          `--subject=${subject}`,
          `--body=${body}`,
          `--reply-to-message-id=${replyToMessageId}`,
        ],
      });
      const parsed = GogSendResponse.parse(raw);
      const messageId = parsed.messageId ?? parsed.id ?? "";
      return { messageId };
    },
  };
}
