// What the web app reads: one page of the message list, one message in full,
// the connected accounts, and a manually-set priority.
//
// The database is reached only through the store seam (#136): `MessageStore`
// and `TriageStore` hold the queries, and what is left here is the assembly —
// how a page's cursor is encoded and what a message looks like once its labels, attachments and triage history
// are hung off it.
import { Effect } from "effect";
import {
  MessageStore,
  TriageStore,
  type MessageLabelRow,
  type MessageRef,
  type StoredAccount,
} from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { ccFromHeaders, replyAllCc } from "./replyRecipients";

export interface ListedAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ListedMessage {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string | null;
  snippet: string | null;
  internalDate: string;
  isArchived: boolean;
  isTrashed: boolean;
  /** When its conversation wakes (ISO), if it is snoozed; null otherwise. */
  snoozedUntil: string | null;
  priority: "high" | "medium" | "low" | null;
  triageId: string | null;
  labels: {
    id: string;
    name: string;
    gmailLabelId: string;
    colorBg: string | null;
    colorFg: string | null;
  }[];
  attachments: ListedAttachment[];
}

export interface ListMessagesArgs {
  accountId?: string;
  priority?: "high" | "medium" | "low";
  labelId?: string;
  limit: number;
  cursor?: string;
  includeArchived?: boolean;
  /** The Done view: archived mail only (Gmail's archive — there is no other flag). */
  archivedOnly?: boolean;
  /** The Snoozed view: snoozed conversations only (and so not in Done). */
  snoozedOnly?: boolean;
  includeTrashed?: boolean;
  includeRemoved?: boolean;
  internalDateFrom?: string;
  internalDateTo?: string;
}

export interface ListMessagesResult {
  items: ListedMessage[];
  nextCursor: string | null;
}

interface CursorPayload {
  internalDate: string;
  gmailMessageId: string;
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (typeof parsed?.internalDate === "string" && typeof parsed?.gmailMessageId === "string") {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return null;
}

const keyOf = (ref: MessageRef) => `${ref.accountId}|${ref.gmailMessageId}`;

/** Group rows carrying a message ref by that ref, mapping each to its shape. */
function byMessage<Row extends MessageRef, Out>(
  rows: readonly Row[],
  shape: (row: Row) => Out,
): Map<string, Out[]> {
  const grouped = new Map<string, Out[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = grouped.get(key) ?? [];
    list.push(shape(row));
    grouped.set(key, list);
  }
  return grouped;
}

const listedLabel = (row: MessageLabelRow) => ({
  id: row.labelId,
  name: row.name,
  gmailLabelId: row.gmailLabelId,
  colorBg: row.colorBg,
  colorFg: row.colorFg,
});

export const listMessagesEffect = (
  args: ListMessagesArgs,
): Effect.Effect<ListMessagesResult, never, MessageStore> =>
  Effect.gen(function* () {
    const decoded = args.cursor ? decodeCursor(args.cursor) : null;

    // One row more than asked for: whether it came back is what says there is
    // a next page, and the cursor points at the last row we actually return.
    const rows = yield* MessageStore.use((svc) =>
      svc.list({
        accountId: args.accountId,
        labelId: args.labelId,
        priority: args.priority,
        includeArchived: args.includeArchived,
        archivedOnly: args.archivedOnly,
        snoozedOnly: args.snoozedOnly,
        includeTrashed: args.includeTrashed,
        includeRemoved: args.includeRemoved,
        internalDateFrom: args.internalDateFrom ? new Date(args.internalDateFrom) : undefined,
        internalDateTo: args.internalDateTo ? new Date(args.internalDateTo) : undefined,
        olderThan: decoded
          ? {
              internalDate: new Date(decoded.internalDate),
              gmailMessageId: decoded.gmailMessageId,
            }
          : undefined,
        limit: args.limit + 1,
      }),
    );

    const slice = rows.slice(0, args.limit);
    const last = slice[slice.length - 1];
    const nextCursor =
      rows.length > args.limit && last
        ? encodeCursor({
            internalDate: last.internalDate.toISOString(),
            gmailMessageId: last.gmailMessageId,
          })
        : null;

    if (slice.length === 0) {
      return { items: [], nextCursor: null };
    }

    const refs: MessageRef[] = slice.map((r) => ({
      accountId: r.accountId,
      gmailMessageId: r.gmailMessageId,
    }));

    const [labelRows, attachmentRows] = yield* Effect.all([
      MessageStore.use((svc) => svc.labelsFor(refs)),
      MessageStore.use((svc) => svc.attachmentsFor(refs)),
    ]);
    const labelsByMsg = byMessage(labelRows, listedLabel);
    const attachmentsByMsg = byMessage(attachmentRows, (a) => ({
      attachmentId: a.attachmentId,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
    }));

    const items: ListedMessage[] = slice.map((r) => {
      const key = keyOf(r);
      return {
        accountId: r.accountId,
        accountEmail: r.accountEmail,
        gmailMessageId: r.gmailMessageId,
        gmailThreadId: r.gmailThreadId,
        fromEmail: r.fromEmail,
        fromName: r.fromName,
        toEmails: r.toEmails,
        subject: r.subject,
        snippet: r.snippet,
        internalDate: r.internalDate.toISOString(),
        isArchived: r.isArchived,
        isTrashed: r.isTrashed,
        snoozedUntil: r.snoozedUntil ? r.snoozedUntil.toISOString() : null,
        priority: r.priority,
        triageId: r.triageId,
        labels: labelsByMsg.get(key) ?? [],
        attachments: attachmentsByMsg.get(key) ?? [],
      };
    });

    return { items, nextCursor };
  });

export interface MessageDetail {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  /** The original's Cc, parsed off `rawHeaders` — there is no column for it. */
  ccEmails: string[];
  /**
   * Who reply-all copies by default: the other participants, minus this
   * account and minus the sender being answered. Empty means reply-all would
   * reach nobody a plain reply does not, so a client can hide the choice.
   */
  replyAllCc: string[];
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  internalDate: string;
  isArchived: boolean;
  isTrashed: boolean;
  /** When its conversation wakes (ISO), if it is snoozed; null otherwise. */
  snoozedUntil: string | null;
  rawHeaders: Record<string, string> | null;
  labels: {
    id: string;
    name: string;
    gmailLabelId: string;
    colorBg: string | null;
    colorFg: string | null;
  }[];
  attachments: ListedAttachment[];
  triageHistory: {
    id: string;
    priority: "high" | "medium" | "low";
    reasoning: string;
    model: string | null;
    createdAt: string;
  }[];
  latestTriageId: string | null;
}

export const getMessageDetailEffect = (
  args: MessageRef,
): Effect.Effect<MessageDetail | null, never, MessageStore | TriageStore> =>
  Effect.gen(function* () {
    const m = yield* MessageStore.use((svc) => svc.detail(args));
    if (!m) return null;

    const refs = [args];
    const [labelRows, attachmentRows, triageRows] = yield* Effect.all([
      MessageStore.use((svc) => svc.labelsFor(refs)),
      MessageStore.use((svc) => svc.attachmentsFor(refs)),
      TriageStore.use((svc) => svc.historyFor(args)),
    ]);

    const triageHistory = triageRows.map((t) => ({
      id: t.id,
      priority: t.priority,
      reasoning: t.reasoning,
      model: t.model,
      createdAt: t.createdAt.toISOString(),
    }));

    const ccEmails = ccFromHeaders(m.rawHeaders);

    return {
      accountId: m.accountId,
      accountEmail: m.accountEmail,
      gmailMessageId: m.gmailMessageId,
      gmailThreadId: m.gmailThreadId,
      fromEmail: m.fromEmail,
      fromName: m.fromName,
      toEmails: m.toEmails,
      ccEmails,
      replyAllCc: replyAllCc({ ...m, ccEmails }, m.accountEmail),
      subject: m.subject,
      snippet: m.snippet,
      bodyText: m.bodyText,
      bodyHtml: m.bodyHtml,
      internalDate: m.internalDate.toISOString(),
      isArchived: m.isArchived,
      isTrashed: m.isTrashed,
      snoozedUntil: m.snoozedUntil ? m.snoozedUntil.toISOString() : null,
      rawHeaders: m.rawHeaders,
      labels: labelRows.map(listedLabel),
      attachments: attachmentRows.map((a) => ({
        attachmentId: a.attachmentId,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
      })),
      triageHistory,
      latestTriageId: triageHistory[0]?.id ?? null,
    };
  });

export interface AccountSummary {
  id: string;
  email: string;
  displayName: string | null;
  /** The user's own name for the mailbox; null means show `displayName`. */
  nickname: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastSyncedAt: string | null;
}

const accountSummary = (r: StoredAccount): AccountSummary => ({
  id: r.id,
  email: r.email,
  displayName: r.displayName,
  nickname: r.nickname,
  avatarUrl: r.avatarUrl,
  createdAt: r.createdAt.toISOString(),
  lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
});

export const listAccountsEffect = (): Effect.Effect<AccountSummary[], never, MessageStore> =>
  Effect.map(
    MessageStore.use((svc) => svc.accounts()),
    (rows) => rows.map(accountSummary),
  );

export const getAccountByIdEffect = (
  id: string,
): Effect.Effect<AccountSummary | null, never, MessageStore> =>
  Effect.map(
    MessageStore.use((svc) => svc.accountById(id)),
    (row) => (row ? accountSummary(row) : null),
  );

/** The longest nickname kept; the switcher has one line for it. */
export const MAX_NICKNAME_LENGTH = 60;

/**
 * Rename a mailbox, for this install only — Gmail is not told. Trimmed, and an
 * empty name clears the nickname so the switcher falls back to the Google
 * display name. Answers the account as it now reads, or null for an unknown id.
 */
export const setAccountNicknameEffect = (args: {
  accountId: string;
  nickname: string | null;
}): Effect.Effect<AccountSummary | null, never, MessageStore> =>
  Effect.gen(function* () {
    const trimmed = args.nickname?.trim() ?? "";
    const nickname = trimmed.length > 0 ? trimmed.slice(0, MAX_NICKNAME_LENGTH) : null;
    const updated = yield* MessageStore.use((svc) =>
      svc.setNickname({ id: args.accountId, nickname }),
    );
    if (updated === 0) return null;
    return yield* getAccountByIdEffect(args.accountId);
  });

export const setMessagePriorityEffect = (args: {
  accountId: string;
  gmailMessageId: string;
  priority: "high" | "medium" | "low";
}): Effect.Effect<{ ok: true }, never, TriageStore> =>
  Effect.gen(function* () {
    // A manual priority is a triage like any other, and the newest one wins —
    // so this is an insert, not an update of what Claude said.
    yield* TriageStore.use((svc) =>
      svc.insert({
        accountId: args.accountId,
        gmailMessageId: args.gmailMessageId,
        priority: args.priority,
        reasoning: "Manually set",
      }),
    );
    return { ok: true };
  });

// Promise facades for the API/CLI boundary.
export async function listMessages(args: ListMessagesArgs): Promise<ListMessagesResult> {
  return runWithStores(listMessagesEffect(args));
}

export async function getMessageDetail(args: MessageRef): Promise<MessageDetail | null> {
  return runWithStores(getMessageDetailEffect(args));
}

export async function listAccounts(): Promise<AccountSummary[]> {
  return runWithStores(listAccountsEffect());
}

export async function getAccountById(id: string): Promise<AccountSummary | null> {
  return runWithStores(getAccountByIdEffect(id));
}

export async function setAccountNickname(args: {
  accountId: string;
  nickname: string | null;
}): Promise<AccountSummary | null> {
  return runWithStores(setAccountNicknameEffect(args));
}

export async function setMessagePriority(args: {
  accountId: string;
  gmailMessageId: string;
  priority: "high" | "medium" | "low";
}): Promise<{ ok: true }> {
  return runWithStores(setMessagePriorityEffect(args));
}
