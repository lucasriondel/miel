import { writeFile, unlink } from "node:fs/promises";
import { getEnv } from "../env";
import {
  GogAuthList,
  GogCreateLabelResponse,
  GogFilter,
  GogFilterListResponse,
  GogLabelListResponse,
  GogMessage,
  GogSearchResponse,
  GogSendResponse,
  type GogAccountT,
  type GogFilterT,
  type GogLabelT,
  type GogMessageT,
} from "../schemas/gmail";
import { createDebug } from "../util/debug";
import {
  ReauthRequiredError,
  ShellError,
  isInvalidGrantStderr,
  spawnJson,
  spawnVoid,
} from "./shell";
import {
  createPasteBackLoginSession,
  submitPasteBackCode,
  type PasteBackResult,
} from "./pasteBackSession";

const debug = createDebug("adapter:gog");

async function withReauthGuard<T>(account: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ShellError && isInvalidGrantStderr(err.stderr)) {
      throw new ReauthRequiredError(account, err);
    }
    throw err;
  }
}

export interface SearchHit {
  messageId: string;
  threadId: string;
}

export interface SendResult {
  messageId: string;
}

export interface ReauthSession {
  sessionId: string;
  url: string;
  done: Promise<PasteBackResult>;
}

export interface GogAdapter {
  listAccounts(): Promise<GogAccountT[]>;
  startReauth(o: { account: string }): Promise<ReauthSession>;
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
  listFilters(o: { account: string }): Promise<GogFilterT[]>;
  createFilter(o: {
    account: string;
    from?: string;
    to?: string;
    subject?: string;
    query?: string;
    addLabel?: string;
  }): Promise<GogFilterT>;
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

const AUTH_URL_RE = /https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?[^\s]+/;

// Matches Claude login's TTL (PRD decision 17).
const REAUTH_TTL_MS = 5 * 60_000;
// Eager spawn blocks the syncAll loop up to this long for the failing account;
// the signal-only fallback covers a timeout (PRD risk: URL-timeout blocking).
const REAUTH_URL_TIMEOUT_MS = 10_000;

/**
 * Spawns `gog auth add <account> --manual --no-input`, which prints the OAuth
 * URL and then waits on stdin for the full pasted redirect URL. The localhost
 * callback flow can't work server-side (Dokploy VPS), so we use `--manual`,
 * which works identically locally and on the VPS.
 */
async function spawnReauthSession(account: string): Promise<ReauthSession> {
  return createPasteBackLoginSession({
    key: account,
    cmd: [bin(), "auth", "add", account, "--manual", "--no-input"],
    urlRegex: AUTH_URL_RE,
    ttlMs: REAUTH_TTL_MS,
    urlTimeoutMs: REAUTH_URL_TIMEOUT_MS,
    label: "gog auth add",
    // gog's --manual flow rejects a pasted redirect whose `state` differs from
    // the one it printed (a stale tab / wrong login attempt). Catch that before
    // the CLI does so the UI shows a clear reason instead of "exit 1".
    verifyState: true,
  });
}

/**
 * Completes a reauth session by submitting the full redirect URL the user
 * pasted from their browser. Delegates to the shared paste-back registry.
 */
export async function submitReauthCode(
  sessionId: string,
  code: string,
): Promise<PasteBackResult> {
  return submitPasteBackCode(sessionId, code);
}

export async function setGogCredentials(credentialsJson: string): Promise<void> {
  const tmpPath = "/tmp/miel-gog-credentials.json";
  try {
    await writeFile(tmpPath, credentialsJson, "utf8");
    await spawnVoid({ cmd: [bin(), "auth", "credentials", tmpPath] });
  } finally {
    try { await unlink(tmpPath); } catch {}
  }
}

export function createGogAdapter(): GogAdapter {
  return {
    async listAccounts() {
      debug("listAccounts");
      const raw = await spawnJson({ cmd: [bin(), "auth", "list", "--json"] });
      const parsed = GogAuthList.parse(raw).accounts;
      debug("listAccounts done", { count: parsed.length });
      return parsed;
    },

    async startReauth({ account }) {
      debug("startReauth", { account });
      return spawnReauthSession(account);
    },

    async searchMessages({ account, query, max = 50 }) {
      debug("searchMessages", { account, query, max });
      return withReauthGuard(account, async () => {
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
        const hits = normalizeSearchHits(raw);
        debug("searchMessages done", { account, hits: hits.length });
        return hits;
      });
    },

    async getMessage({ account, messageId }) {
      debug("getMessage", { account, messageId });
      return withReauthGuard(account, async () => {
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
        const parsed = GogMessage.parse(unwrapGetMessageResponse(raw));
        debug("getMessage done", { account, messageId });
        return parsed;
      });
    },

    async listLabels({ account }) {
      debug("listLabels", { account });
      return withReauthGuard(account, async () => {
        const raw = await spawnJson({
          cmd: [bin(), "--account", account, "--json", "gmail", "labels", "list"],
        });
        const parsed = GogLabelListResponse.parse(raw);
        const out = Array.isArray(parsed) ? parsed : parsed.labels;
        debug("listLabels done", { account, count: out.length });
        return out;
      });
    },

    async createLabel({ account, name }) {
      debug("createLabel", { account, name });
      return withReauthGuard(account, async () => {
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
        const parsed = GogCreateLabelResponse.parse(raw);
        debug("createLabel done", { account, name, gmailLabelId: parsed.id });
        return parsed;
      });
    },

    async batchModifyLabels({ account, messageIds, add, remove }) {
      if (messageIds.length === 0) {
        debug("batchModifyLabels noop (no messages)", { account });
        return;
      }
      debug("batchModifyLabels", {
        account,
        messageCount: messageIds.length,
        add: add ?? [],
        remove: remove ?? [],
      });
      await withReauthGuard(account, async () => {
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
        if (remove && remove.length > 0)
          cmd.push(`--remove=${remove.join(",")}`);
        await spawnVoid({ cmd });
      });
      debug("batchModifyLabels done", { account });
    },

    async trashThread({ account, threadId }) {
      debug("trashThread", { account, threadId });
      await withReauthGuard(account, () =>
        spawnVoid({
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
        }),
      );
      debug("trashThread done", { account, threadId });
    },

    async archiveThread({ account, threadId }) {
      debug("archiveThread", { account, threadId });
      await withReauthGuard(account, () =>
        spawnVoid({
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
        }),
      );
      debug("archiveThread done", { account, threadId });
    },

    async sendReply({ account, to, subject, body, replyToMessageId }) {
      debug("sendReply", {
        account,
        to,
        subject,
        bodyLen: body.length,
        replyToMessageId,
      });
      return withReauthGuard(account, async () => {
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
        debug("sendReply done", { account, sentMessageId: messageId });
        return { messageId };
      });
    },

    async listFilters({ account }) {
      debug("listFilters", { account });
      return withReauthGuard(account, async () => {
        const raw = await spawnJson({
          cmd: [
            bin(),
            "--account",
            account,
            "--json",
            "gmail",
            "filters",
            "list",
          ],
        });
        const parsed = GogFilterListResponse.parse(raw);
        const list = Array.isArray(parsed) ? parsed : (parsed.filters ?? []);
        debug("listFilters done", { account, count: list.length });
        return list;
      });
    },

    async createFilter({ account, from, to, subject, query, addLabel }) {
      debug("createFilter", { account, from, to, subject, query, addLabel });
      return withReauthGuard(account, async () => {
        const cmd = [
          bin(),
          "--account",
          account,
          "--json",
          "--force",
          "gmail",
          "filters",
          "create",
        ];
        if (from) cmd.push(`--from=${from}`);
        if (to) cmd.push(`--to=${to}`);
        if (subject) cmd.push(`--subject=${subject}`);
        if (query) cmd.push(`--query=${query}`);
        if (addLabel) cmd.push(`--add-label=${addLabel}`);
        const raw = await spawnJson({ cmd });
        const parsed = GogFilter.parse(raw);
        debug("createFilter done", { account, id: parsed.id });
        return parsed;
      });
    },
  };
}
