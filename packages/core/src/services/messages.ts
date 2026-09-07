// What the web app reads: one page of the message list, one message in full,
// the connected accounts, and a manually-set priority.
//
// The database is reached only through the store seam (#136): `MessageStore`
// and `TriageStore` hold the queries, and what is left here is the assembly —
// how a page's cursor is encoded, which suggestions still count as pending,
// and what a message looks like once its labels, attachments and triage history
// are hung off it.
import { Effect } from "effect";
import {
  MessageStore,
  TriageStore,
  type ListedMessageRow,
  type MessageLabelRow,
  type MessageRef,
  type StoredExistingSuggestion,
  type StoredNewSuggestion,
} from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { getLatestTriageForMessage } from "./apply";

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
  pendingSuggestions: {
    existing: {
      labelId: string;
      name: string;
      colorBg: string | null;
      colorFg: string | null;
    }[];
    new: { suggestionId: string; name: string }[];
  };
}

export interface ListMessagesArgs {
  accountId?: string;
  priority?: "high" | "medium" | "low";
  labelId?: string;
  limit: number;
  cursor?: string;
  includeArchived?: boolean;
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
): Effect.Effect<ListMessagesResult, never, MessageStore | TriageStore> =>
  Effect.gen(function* () {
    const decoded = args.cursor ? decodeCursor(args.cursor) : null;

    // One row more than asked for: whether it came back is what says there is
    // a next page, and the cursor points at the last row we actually return.
    const rows = yield* MessageStore.list({
      accountId: args.accountId,
      labelId: args.labelId,
      priority: args.priority,
      includeArchived: args.includeArchived,
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
    });

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
      MessageStore.labelsFor(refs),
      MessageStore.attachmentsFor(refs),
    ]);
    const labelsByMsg = byMessage(labelRows, listedLabel);
    const attachmentsByMsg = byMessage(attachmentRows, (a) => ({
      attachmentId: a.attachmentId,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
    }));

    const { existing, new: proposed } = yield* pendingSuggestionsFor(slice, labelsByMsg);

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
        priority: r.priority,
        triageId: r.triageId,
        labels: labelsByMsg.get(key) ?? [],
        attachments: attachmentsByMsg.get(key) ?? [],
        pendingSuggestions: {
          existing: existing.get(key) ?? [],
          new: proposed.get(key) ?? [],
        },
      };
    });

    return { items, nextCursor };
  });

/**
 * What is still worth showing on a listed message: the pending suggestions of
 * its newest triage, minus the ones whose label is already attached.
 *
 * That last subtraction is the rule the list exists for — a suggestion accepted
 * out of band (a filter, Gmail itself) would otherwise be offered again beside
 * the label it produced.
 */
const pendingSuggestionsFor = (
  rows: readonly ListedMessageRow[],
  labelsByMsg: Map<string, ListedMessage["labels"]>,
): Effect.Effect<
  {
    existing: Map<string, ListedMessage["pendingSuggestions"]["existing"]>;
    new: Map<string, ListedMessage["pendingSuggestions"]["new"]>;
  },
  never,
  TriageStore
> =>
  Effect.gen(function* () {
    const existing = new Map<string, ListedMessage["pendingSuggestions"]["existing"]>();
    const proposed = new Map<string, ListedMessage["pendingSuggestions"]["new"]>();

    const triageToMsg = new Map<string, MessageRef>();
    for (const r of rows) {
      if (r.triageId) triageToMsg.set(r.triageId, r);
    }
    const triageIds = [...triageToMsg.keys()];
    if (triageIds.length === 0) return { existing, new: proposed };

    const [existingRows, newRows] = yield* Effect.all([
      TriageStore.existingSuggestionsFor(triageIds),
      TriageStore.newSuggestionsFor(triageIds),
    ]);

    for (const s of existingRows) {
      if (s.status !== "pending") continue;
      const msg = triageToMsg.get(s.triageId);
      if (!msg) continue;
      const key = keyOf(msg);
      const alreadyApplied = (labelsByMsg.get(key) ?? []).some((l) => l.id === s.labelId);
      if (alreadyApplied) continue;
      const list = existing.get(key) ?? [];
      list.push({
        labelId: s.labelId,
        name: s.name,
        colorBg: s.colorBg,
        colorFg: s.colorFg,
      });
      existing.set(key, list);
    }

    for (const s of newRows) {
      if (s.status !== "pending") continue;
      const msg = triageToMsg.get(s.triageId);
      if (!msg) continue;
      const key = keyOf(msg);
      const list = proposed.get(key) ?? [];
      list.push({ suggestionId: s.suggestionId, name: s.name });
      proposed.set(key, list);
    }

    return { existing, new: proposed };
  });

export interface MessageDetail {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  internalDate: string;
  isArchived: boolean;
  isTrashed: boolean;
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
    existingLabelSuggestions: {
      labelId: string;
      name: string;
      colorBg: string | null;
      colorFg: string | null;
      status: "pending" | "applied" | "dismissed";
    }[];
    newLabelSuggestions: {
      suggestionId: string;
      name: string;
      reasoning: string | null;
      status: "pending" | "applied" | "dismissed";
    }[];
  }[];
  latestTriageId: string | null;
}

/** Group suggestion rows by the triage they belong to. */
function byTriage<Row extends { triageId: string }, Out>(
  rows: readonly Row[],
  shape: (row: Row) => Out,
): Map<string, Out[]> {
  const grouped = new Map<string, Out[]>();
  for (const row of rows) {
    const list = grouped.get(row.triageId) ?? [];
    list.push(shape(row));
    grouped.set(row.triageId, list);
  }
  return grouped;
}

const detailExistingSuggestion = (s: StoredExistingSuggestion) => ({
  labelId: s.labelId,
  name: s.name,
  colorBg: s.colorBg,
  colorFg: s.colorFg,
  status: s.status,
});

const detailNewSuggestion = (s: StoredNewSuggestion) => ({
  suggestionId: s.suggestionId,
  name: s.name,
  reasoning: s.reasoning,
  status: s.status,
});

export const getMessageDetailEffect = (
  args: MessageRef,
): Effect.Effect<MessageDetail | null, never, MessageStore | TriageStore> =>
  Effect.gen(function* () {
    const m = yield* MessageStore.detail(args);
    if (!m) return null;

    const refs = [args];
    const [labelRows, attachmentRows, triageRows] = yield* Effect.all([
      MessageStore.labelsFor(refs),
      MessageStore.attachmentsFor(refs),
      TriageStore.historyFor(args),
    ]);

    // The whole history, not just the pending part: the detail page shows what
    // was suggested and what became of it.
    const triageIds = triageRows.map((t) => t.id);
    const [existingSugs, newSugs] = yield* Effect.all([
      TriageStore.existingSuggestionsFor(triageIds),
      TriageStore.newSuggestionsFor(triageIds),
    ]);
    const existingByTriage = byTriage(existingSugs, detailExistingSuggestion);
    const newByTriage = byTriage(newSugs, detailNewSuggestion);

    const triageHistory = triageRows.map((t) => ({
      id: t.id,
      priority: t.priority,
      reasoning: t.reasoning,
      model: t.model,
      createdAt: t.createdAt.toISOString(),
      existingLabelSuggestions: existingByTriage.get(t.id) ?? [],
      newLabelSuggestions: newByTriage.get(t.id) ?? [],
    }));

    return {
      accountId: m.accountId,
      accountEmail: m.accountEmail,
      gmailMessageId: m.gmailMessageId,
      gmailThreadId: m.gmailThreadId,
      fromEmail: m.fromEmail,
      fromName: m.fromName,
      toEmails: m.toEmails,
      subject: m.subject,
      snippet: m.snippet,
      bodyText: m.bodyText,
      bodyHtml: m.bodyHtml,
      internalDate: m.internalDate.toISOString(),
      isArchived: m.isArchived,
      isTrashed: m.isTrashed,
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
  avatarUrl: string | null;
  createdAt: string;
  lastSyncedAt: string | null;
}

const accountSummary = (r: {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  lastSyncedAt: Date | null;
}): AccountSummary => ({
  id: r.id,
  email: r.email,
  displayName: r.displayName,
  avatarUrl: r.avatarUrl,
  createdAt: r.createdAt.toISOString(),
  lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
});

export const listAccountsEffect = (): Effect.Effect<AccountSummary[], never, MessageStore> =>
  Effect.map(MessageStore.accounts(), (rows) => rows.map(accountSummary));

export const getAccountByIdEffect = (
  id: string,
): Effect.Effect<AccountSummary | null, never, MessageStore> =>
  Effect.map(MessageStore.accountById(id), (row) => (row ? accountSummary(row) : null));

export const setMessagePriorityEffect = (args: {
  accountId: string;
  gmailMessageId: string;
  priority: "high" | "medium" | "low";
}): Effect.Effect<{ ok: true }, never, TriageStore> =>
  Effect.gen(function* () {
    // A manual priority is a triage like any other, and the newest one wins —
    // so this is an insert, not an update of what Claude said.
    yield* TriageStore.insert({
      accountId: args.accountId,
      gmailMessageId: args.gmailMessageId,
      priority: args.priority,
      reasoning: "Manually set",
    });
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

export async function setMessagePriority(args: {
  accountId: string;
  gmailMessageId: string;
  priority: "high" | "medium" | "low";
}): Promise<{ ok: true }> {
  return runWithStores(setMessagePriorityEffect(args));
}

export { getLatestTriageForMessage };
