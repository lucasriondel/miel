import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  accounts,
  labels,
  messageLabels,
  messages,
  suggestedLabels,
  triageLabelSuggestions,
  triages,
} from "../db/schema";
import { getLatestTriageForMessage } from "./apply";

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
    if (
      typeof parsed?.internalDate === "string" &&
      typeof parsed?.gmailMessageId === "string"
    ) {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function listMessages(
  args: ListMessagesArgs,
): Promise<ListMessagesResult> {
  const { db } = getDb();

  const latestTriagePerMsg = db.$with("latest_triage").as(
    db
      .selectDistinctOn([triages.accountId, triages.gmailMessageId], {
        accountId: triages.accountId,
        gmailMessageId: triages.gmailMessageId,
        triageId: triages.id,
        priority: triages.priority,
      })
      .from(triages)
      .orderBy(
        triages.accountId,
        triages.gmailMessageId,
        desc(triages.createdAt),
      ),
  );

  const conditions: ReturnType<typeof eq>[] = [];
  if (args.accountId) {
    conditions.push(eq(messages.accountId, args.accountId));
  }
  if (!args.includeArchived) {
    conditions.push(eq(messages.isArchived, false));
  }
  if (!args.includeTrashed) {
    conditions.push(eq(messages.isTrashed, false));
  }
  if (args.cursor) {
    const decoded = decodeCursor(args.cursor);
    if (decoded) {
      conditions.push(
        sql`(${messages.internalDate}, ${messages.gmailMessageId}) < (${new Date(decoded.internalDate)}, ${decoded.gmailMessageId})` as ReturnType<typeof eq>,
      );
    }
  }
  if (args.priority) {
    conditions.push(eq(latestTriagePerMsg.priority, args.priority));
  }
  if (args.internalDateFrom) {
    conditions.push(
      gte(messages.internalDate, new Date(args.internalDateFrom)) as ReturnType<
        typeof eq
      >,
    );
  }
  if (args.internalDateTo) {
    conditions.push(
      lt(messages.internalDate, new Date(args.internalDateTo)) as ReturnType<
        typeof eq
      >,
    );
  }

  let query = db
    .with(latestTriagePerMsg)
    .select({
      accountId: messages.accountId,
      accountEmail: accounts.email,
      gmailMessageId: messages.gmailMessageId,
      gmailThreadId: messages.gmailThreadId,
      fromEmail: messages.fromEmail,
      fromName: messages.fromName,
      toEmails: messages.toEmails,
      subject: messages.subject,
      snippet: messages.snippet,
      internalDate: messages.internalDate,
      isArchived: messages.isArchived,
      isTrashed: messages.isTrashed,
      priority: latestTriagePerMsg.priority,
      triageId: latestTriagePerMsg.triageId,
    })
    .from(messages)
    .innerJoin(accounts, eq(messages.accountId, accounts.id))
    .leftJoin(
      latestTriagePerMsg,
      and(
        eq(latestTriagePerMsg.accountId, messages.accountId),
        eq(latestTriagePerMsg.gmailMessageId, messages.gmailMessageId),
      ),
    )
    .$dynamic();

  if (args.labelId) {
    query = query.innerJoin(
      messageLabels,
      and(
        eq(messageLabels.accountId, messages.accountId),
        eq(messageLabels.gmailMessageId, messages.gmailMessageId),
        eq(messageLabels.labelId, args.labelId),
      ),
    );
  }

  const rows = await query
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(messages.internalDate), desc(messages.gmailMessageId))
    .limit(args.limit + 1);

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

  const ids = slice.map((r) => ({
    accountId: r.accountId,
    gmailMessageId: r.gmailMessageId,
  }));
  const labelRows = await db
    .select({
      accountId: messageLabels.accountId,
      gmailMessageId: messageLabels.gmailMessageId,
      labelId: labels.id,
      name: labels.name,
      gmailLabelId: labels.gmailLabelId,
      colorBg: labels.colorBg,
      colorFg: labels.colorFg,
    })
    .from(messageLabels)
    .innerJoin(labels, eq(messageLabels.labelId, labels.id))
    .where(
      sql`(${messageLabels.accountId}, ${messageLabels.gmailMessageId}) IN (${sql.join(
        ids.map(
          (i) => sql`(${i.accountId}::uuid, ${i.gmailMessageId})`,
        ),
        sql`, `,
      )})`,
    );

  const labelsByMsg = new Map<string, ListedMessage["labels"]>();
  for (const lr of labelRows) {
    const key = `${lr.accountId}|${lr.gmailMessageId}`;
    const list = labelsByMsg.get(key) ?? [];
    list.push({
      id: lr.labelId,
      name: lr.name,
      gmailLabelId: lr.gmailLabelId,
      colorBg: lr.colorBg,
      colorFg: lr.colorFg,
    });
    labelsByMsg.set(key, list);
  }

  const triageIds = slice
    .map((r) => r.triageId)
    .filter((id): id is string => Boolean(id));
  const triageToMsg = new Map<string, { accountId: string; gmailMessageId: string }>();
  for (const r of slice) {
    if (r.triageId) {
      triageToMsg.set(r.triageId, {
        accountId: r.accountId,
        gmailMessageId: r.gmailMessageId,
      });
    }
  }

  const existingSuggestionsByMsg = new Map<
    string,
    ListedMessage["pendingSuggestions"]["existing"]
  >();
  const newSuggestionsByMsg = new Map<
    string,
    ListedMessage["pendingSuggestions"]["new"]
  >();

  if (triageIds.length > 0) {
    const existingSugRows = await db
      .select({
        triageId: triageLabelSuggestions.triageId,
        labelId: labels.id,
        name: labels.name,
        colorBg: labels.colorBg,
        colorFg: labels.colorFg,
      })
      .from(triageLabelSuggestions)
      .innerJoin(labels, eq(triageLabelSuggestions.labelId, labels.id))
      .where(
        and(
          eq(triageLabelSuggestions.status, "pending"),
          sql`${triageLabelSuggestions.triageId} IN (${sql.join(
            triageIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`,
        ),
      );
    for (const s of existingSugRows) {
      const msg = triageToMsg.get(s.triageId);
      if (!msg) continue;
      const key = `${msg.accountId}|${msg.gmailMessageId}`;
      const alreadyApplied = (labelsByMsg.get(key) ?? []).some(
        (l) => l.id === s.labelId,
      );
      if (alreadyApplied) continue;
      const list = existingSuggestionsByMsg.get(key) ?? [];
      list.push({
        labelId: s.labelId,
        name: s.name,
        colorBg: s.colorBg,
        colorFg: s.colorFg,
      });
      existingSuggestionsByMsg.set(key, list);
    }

    const newSugRows = await db
      .select({
        triageId: suggestedLabels.triageId,
        suggestionId: suggestedLabels.id,
        name: suggestedLabels.name,
      })
      .from(suggestedLabels)
      .where(
        and(
          eq(suggestedLabels.status, "pending"),
          sql`${suggestedLabels.triageId} IN (${sql.join(
            triageIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`,
        ),
      );
    for (const s of newSugRows) {
      const msg = triageToMsg.get(s.triageId);
      if (!msg) continue;
      const key = `${msg.accountId}|${msg.gmailMessageId}`;
      const list = newSuggestionsByMsg.get(key) ?? [];
      list.push({ suggestionId: s.suggestionId, name: s.name });
      newSuggestionsByMsg.set(key, list);
    }
  }

  const items: ListedMessage[] = slice.map((r) => {
    const key = `${r.accountId}|${r.gmailMessageId}`;
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
      pendingSuggestions: {
        existing: existingSuggestionsByMsg.get(key) ?? [],
        new: newSuggestionsByMsg.get(key) ?? [],
      },
    };
  });

  return { items, nextCursor };
}

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
  triageHistory: {
    id: string;
    priority: "high" | "medium" | "low";
    reasoning: string;
    model: string | null;
    createdAt: string;
    existingLabelSuggestions: {
      labelId: string;
      name: string;
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

export async function getMessageDetail(args: {
  accountId: string;
  gmailMessageId: string;
}): Promise<MessageDetail | null> {
  const { db } = getDb();
  const rows = await db
    .select({
      accountId: messages.accountId,
      accountEmail: accounts.email,
      gmailMessageId: messages.gmailMessageId,
      gmailThreadId: messages.gmailThreadId,
      fromEmail: messages.fromEmail,
      fromName: messages.fromName,
      toEmails: messages.toEmails,
      subject: messages.subject,
      snippet: messages.snippet,
      bodyText: messages.bodyText,
      bodyHtml: messages.bodyHtml,
      internalDate: messages.internalDate,
      isArchived: messages.isArchived,
      isTrashed: messages.isTrashed,
      rawHeaders: messages.rawHeaders,
    })
    .from(messages)
    .innerJoin(accounts, eq(messages.accountId, accounts.id))
    .where(
      and(
        eq(messages.accountId, args.accountId),
        eq(messages.gmailMessageId, args.gmailMessageId),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;
  const m = rows[0];

  const labelRows = await db
    .select({
      id: labels.id,
      name: labels.name,
      gmailLabelId: labels.gmailLabelId,
      colorBg: labels.colorBg,
      colorFg: labels.colorFg,
    })
    .from(messageLabels)
    .innerJoin(labels, eq(messageLabels.labelId, labels.id))
    .where(
      and(
        eq(messageLabels.accountId, args.accountId),
        eq(messageLabels.gmailMessageId, args.gmailMessageId),
      ),
    );

  const triageRows = await db
    .select({
      id: triages.id,
      priority: triages.priority,
      reasoning: triages.reasoning,
      model: triages.model,
      createdAt: triages.createdAt,
    })
    .from(triages)
    .where(
      and(
        eq(triages.accountId, args.accountId),
        eq(triages.gmailMessageId, args.gmailMessageId),
      ),
    )
    .orderBy(desc(triages.createdAt));

  const triageIds = triageRows.map((t) => t.id);
  const existingByTriage = new Map<
    string,
    MessageDetail["triageHistory"][number]["existingLabelSuggestions"]
  >();
  const newByTriage = new Map<
    string,
    MessageDetail["triageHistory"][number]["newLabelSuggestions"]
  >();

  if (triageIds.length > 0) {
    const existingSugs = await db
      .select({
        triageId: triageLabelSuggestions.triageId,
        labelId: triageLabelSuggestions.labelId,
        name: labels.name,
        status: triageLabelSuggestions.status,
      })
      .from(triageLabelSuggestions)
      .innerJoin(labels, eq(triageLabelSuggestions.labelId, labels.id))
      .where(
        sql`${triageLabelSuggestions.triageId} IN (${sql.join(
          triageIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      );
    for (const es of existingSugs) {
      const list = existingByTriage.get(es.triageId) ?? [];
      list.push({ labelId: es.labelId, name: es.name, status: es.status });
      existingByTriage.set(es.triageId, list);
    }
    const newSugs = await db
      .select({
        triageId: suggestedLabels.triageId,
        suggestionId: suggestedLabels.id,
        name: suggestedLabels.name,
        reasoning: suggestedLabels.reasoning,
        status: suggestedLabels.status,
      })
      .from(suggestedLabels)
      .where(
        sql`${suggestedLabels.triageId} IN (${sql.join(
          triageIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      );
    for (const ns of newSugs) {
      const list = newByTriage.get(ns.triageId) ?? [];
      list.push({
        suggestionId: ns.suggestionId,
        name: ns.name,
        reasoning: ns.reasoning,
        status: ns.status,
      });
      newByTriage.set(ns.triageId, list);
    }
  }

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
    labels: labelRows,
    triageHistory,
    latestTriageId: triageHistory[0]?.id ?? null,
  };
}

export interface AccountSummary {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  lastSyncedAt: string | null;
}

export async function listAccounts(): Promise<AccountSummary[]> {
  const { db } = getDb();
  const rows = await db
    .select({
      id: accounts.id,
      email: accounts.email,
      displayName: accounts.displayName,
      createdAt: accounts.createdAt,
      lastSyncedAt: accounts.lastSyncedAt,
    })
    .from(accounts)
    .orderBy(accounts.email);
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.displayName,
    createdAt: r.createdAt.toISOString(),
    lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
  }));
}

export async function getAccountById(
  id: string,
): Promise<AccountSummary | null> {
  const { db } = getDb();
  const rows = await db
    .select({
      id: accounts.id,
      email: accounts.email,
      displayName: accounts.displayName,
      createdAt: accounts.createdAt,
      lastSyncedAt: accounts.lastSyncedAt,
    })
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    email: r.email,
    displayName: r.displayName,
    createdAt: r.createdAt.toISOString(),
    lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
  };
}

export { getLatestTriageForMessage };
