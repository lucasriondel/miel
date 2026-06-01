import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  labels,
  messageLabels,
  suggestedLabels,
  triageLabelSuggestions,
  triages,
} from "../db/schema";
import { createGogAdapter, type GogAdapter } from "../adapters/gog";
import { createDebug } from "../util/debug";
import { getAccountByEmail } from "./accounts";
import { ensureLabel, type LabelRow } from "./labels";

const debug = createDebug("service:apply");

export interface ApplyLabelsResult {
  ok: true;
  added: { labelId: string; gmailLabelId: string; name: string }[];
  removed: { labelId: string; gmailLabelId: string; name: string }[];
}

export interface ApplySuggestionsResult {
  ok: true;
  appliedExistingLabelIds: string[];
  createdLabels: { suggestionId: string; labelId: string; name: string }[];
  attached: { gmailLabelId: string; name: string }[];
}

interface ApplyContextResolved {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  gog: GogAdapter;
}

async function resolveContext(args: {
  accountEmail?: string;
  accountId?: string;
  gmailMessageId: string;
  gog?: GogAdapter;
}): Promise<ApplyContextResolved> {
  const gog = args.gog ?? createGogAdapter();
  if (args.accountEmail) {
    const acc = await getAccountByEmail(args.accountEmail);
    if (!acc) {
      throw new Error(`Account not synced: ${args.accountEmail}`);
    }
    return {
      accountId: acc.id,
      accountEmail: acc.email,
      gmailMessageId: args.gmailMessageId,
      gog,
    };
  }
  if (!args.accountId) {
    throw new Error("accountEmail or accountId is required");
  }
  const { db } = getDb();
  const { accounts } = await import("../db/schema");
  const rows = await db
    .select({ id: accounts.id, email: accounts.email })
    .from(accounts)
    .where(eq(accounts.id, args.accountId))
    .limit(1);
  if (rows.length === 0) {
    throw new Error(`Account not found: ${args.accountId}`);
  }
  return {
    accountId: rows[0].id,
    accountEmail: rows[0].email,
    gmailMessageId: args.gmailMessageId,
    gog,
  };
}

export async function applyLabels(args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
  gog?: GogAdapter;
}): Promise<ApplyLabelsResult> {
  debug("applyLabels", {
    accountEmail: args.accountEmail,
    accountId: args.accountId,
    gmailMessageId: args.gmailMessageId,
    add: args.addLabelIds ?? [],
    remove: args.removeLabelIds ?? [],
  });
  const ctx = await resolveContext(args);
  const { db } = getDb();

  const allIds = [
    ...(args.addLabelIds ?? []),
    ...(args.removeLabelIds ?? []),
  ];
  const labelRows = allIds.length
    ? await db
        .select({
          id: labels.id,
          gmailLabelId: labels.gmailLabelId,
          name: labels.name,
        })
        .from(labels)
        .where(and(eq(labels.accountId, ctx.accountId), inArray(labels.id, allIds)))
    : [];
  const byId = new Map(labelRows.map((l) => [l.id, l]));

  const addRows = (args.addLabelIds ?? [])
    .map((id) => byId.get(id))
    .filter((l): l is (typeof labelRows)[number] => Boolean(l));
  const removeRows = (args.removeLabelIds ?? [])
    .map((id) => byId.get(id))
    .filter((l): l is (typeof labelRows)[number] => Boolean(l));

  if (addRows.length === 0 && removeRows.length === 0) {
    debug("applyLabels noop", { gmailMessageId: ctx.gmailMessageId });
    return { ok: true, added: [], removed: [] };
  }

  await ctx.gog.batchModifyLabels({
    account: ctx.accountEmail,
    messageIds: [ctx.gmailMessageId],
    add: addRows.length ? addRows.map((l) => l.gmailLabelId) : undefined,
    remove: removeRows.length ? removeRows.map((l) => l.gmailLabelId) : undefined,
  });

  if (addRows.length > 0) {
    await db
      .insert(messageLabels)
      .values(
        addRows.map((l) => ({
          accountId: ctx.accountId,
          gmailMessageId: ctx.gmailMessageId,
          labelId: l.id,
        })),
      )
      .onConflictDoNothing();
  }
  if (removeRows.length > 0) {
    await db
      .delete(messageLabels)
      .where(
        and(
          eq(messageLabels.accountId, ctx.accountId),
          eq(messageLabels.gmailMessageId, ctx.gmailMessageId),
          inArray(
            messageLabels.labelId,
            removeRows.map((l) => l.id),
          ),
        ),
      );
  }

  debug("applyLabels done", {
    gmailMessageId: ctx.gmailMessageId,
    added: addRows.map((l) => l.name),
    removed: removeRows.map((l) => l.name),
  });
  return {
    ok: true,
    added: addRows.map((l) => ({
      labelId: l.id,
      gmailLabelId: l.gmailLabelId,
      name: l.name,
    })),
    removed: removeRows.map((l) => ({
      labelId: l.id,
      gmailLabelId: l.gmailLabelId,
      name: l.name,
    })),
  };
}

export interface ApplySuggestionsInput {
  triageId: string;
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  acceptExistingLabelIds?: string[];
  acceptNewSuggestionIds?: string[];
  gog?: GogAdapter;
}

export async function applySuggestions(
  input: ApplySuggestionsInput,
): Promise<ApplySuggestionsResult> {
  debug("applySuggestions", {
    triageId: input.triageId,
    gmailMessageId: input.gmailMessageId,
    acceptExisting: input.acceptExistingLabelIds ?? [],
    acceptNew: input.acceptNewSuggestionIds ?? [],
  });
  const ctx = await resolveContext(input);
  const { db } = getDb();

  const triageRow = await db
    .select({ id: triages.id, gmailMessageId: triages.gmailMessageId })
    .from(triages)
    .where(eq(triages.id, input.triageId))
    .limit(1);
  if (triageRow.length === 0) {
    throw new Error(`Triage not found: ${input.triageId}`);
  }
  if (triageRow[0].gmailMessageId !== ctx.gmailMessageId) {
    throw new Error(
      `Triage ${input.triageId} does not belong to message ${ctx.gmailMessageId}`,
    );
  }

  const existingIds = input.acceptExistingLabelIds ?? [];
  const newIds = input.acceptNewSuggestionIds ?? [];

  const existingRows: LabelRow[] = existingIds.length
    ? await db
        .select({
          id: labels.id,
          accountId: labels.accountId,
          gmailLabelId: labels.gmailLabelId,
          name: labels.name,
          type: labels.type,
          colorBg: labels.colorBg,
          colorFg: labels.colorFg,
        })
        .from(labels)
        .where(
          and(
            eq(labels.accountId, ctx.accountId),
            inArray(labels.id, existingIds),
          ),
        )
    : [];

  const suggestionRows = newIds.length
    ? await db
        .select({
          id: suggestedLabels.id,
          triageId: suggestedLabels.triageId,
          name: suggestedLabels.name,
          status: suggestedLabels.status,
          createdLabelId: suggestedLabels.createdLabelId,
        })
        .from(suggestedLabels)
        .where(inArray(suggestedLabels.id, newIds))
    : [];

  const createdLabels: ApplySuggestionsResult["createdLabels"] = [];
  const labelsToAttach: { id: string; gmailLabelId: string; name: string }[] = [
    ...existingRows.map((l) => ({
      id: l.id,
      gmailLabelId: l.gmailLabelId,
      name: l.name,
    })),
  ];

  for (const sug of suggestionRows) {
    if (sug.triageId !== input.triageId) continue;
    const label = await ensureLabel({
      accountId: ctx.accountId,
      accountEmail: ctx.accountEmail,
      name: sug.name,
      gog: ctx.gog,
    });
    await db
      .update(suggestedLabels)
      .set({ status: "applied", createdLabelId: label.id })
      .where(eq(suggestedLabels.id, sug.id));
    createdLabels.push({
      suggestionId: sug.id,
      labelId: label.id,
      name: label.name,
    });
    labelsToAttach.push({
      id: label.id,
      gmailLabelId: label.gmailLabelId,
      name: label.name,
    });
  }

  if (labelsToAttach.length > 0) {
    await ctx.gog.batchModifyLabels({
      account: ctx.accountEmail,
      messageIds: [ctx.gmailMessageId],
      add: labelsToAttach.map((l) => l.gmailLabelId),
    });
    await db
      .insert(messageLabels)
      .values(
        labelsToAttach.map((l) => ({
          accountId: ctx.accountId,
          gmailMessageId: ctx.gmailMessageId,
          labelId: l.id,
        })),
      )
      .onConflictDoNothing();
  }

  if (existingRows.length > 0) {
    await db
      .update(triageLabelSuggestions)
      .set({ status: "applied" })
      .where(
        and(
          eq(triageLabelSuggestions.triageId, input.triageId),
          inArray(
            triageLabelSuggestions.labelId,
            existingRows.map((l) => l.id),
          ),
        ),
      );
  }

  debug("applySuggestions done", {
    triageId: input.triageId,
    appliedExisting: existingRows.map((l) => l.name),
    createdLabels: createdLabels.map((l) => l.name),
    attached: labelsToAttach.map((l) => l.name),
  });
  return {
    ok: true,
    appliedExistingLabelIds: existingRows.map((l) => l.id),
    createdLabels,
    attached: labelsToAttach.map((l) => ({
      gmailLabelId: l.gmailLabelId,
      name: l.name,
    })),
  };
}

export async function archiveMessage(args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  gog?: GogAdapter;
}): Promise<{ ok: true; threadId: string }> {
  debug("archiveMessage", {
    gmailMessageId: args.gmailMessageId,
    accountEmail: args.accountEmail,
  });
  const ctx = await resolveContext(args);
  const { db } = getDb();
  const { messages } = await import("../db/schema");
  const row = await db
    .select({
      gmailThreadId: messages.gmailThreadId,
    })
    .from(messages)
    .where(
      and(
        eq(messages.accountId, ctx.accountId),
        eq(messages.gmailMessageId, ctx.gmailMessageId),
      ),
    )
    .limit(1);
  if (row.length === 0) {
    throw new Error(`Message not found: ${ctx.gmailMessageId}`);
  }
  await ctx.gog.archiveThread({
    account: ctx.accountEmail,
    threadId: row[0].gmailThreadId,
  });
  // gog archives the whole thread, so mark every message in the thread
  // archived — otherwise sibling messages linger in the list and look like
  // the just-archived message reappeared.
  await db
    .update(messages)
    .set({ isArchived: true })
    .where(
      and(
        eq(messages.accountId, ctx.accountId),
        eq(messages.gmailThreadId, row[0].gmailThreadId),
      ),
    );
  debug("archiveMessage done", {
    gmailMessageId: ctx.gmailMessageId,
    threadId: row[0].gmailThreadId,
  });
  return { ok: true, threadId: row[0].gmailThreadId };
}

export async function trashMessage(args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  gog?: GogAdapter;
}): Promise<{ ok: true; threadId: string }> {
  debug("trashMessage", {
    gmailMessageId: args.gmailMessageId,
    accountEmail: args.accountEmail,
  });
  const ctx = await resolveContext(args);
  const { db } = getDb();
  const { messages } = await import("../db/schema");
  const row = await db
    .select({
      gmailThreadId: messages.gmailThreadId,
    })
    .from(messages)
    .where(
      and(
        eq(messages.accountId, ctx.accountId),
        eq(messages.gmailMessageId, ctx.gmailMessageId),
      ),
    )
    .limit(1);
  if (row.length === 0) {
    throw new Error(`Message not found: ${ctx.gmailMessageId}`);
  }
  await ctx.gog.trashThread({
    account: ctx.accountEmail,
    threadId: row[0].gmailThreadId,
  });
  // gog trashes the whole thread, so mark every message in the thread trashed
  // — otherwise sibling messages linger in the list and look like the
  // just-deleted message reappeared.
  await db
    .update(messages)
    .set({ isTrashed: true })
    .where(
      and(
        eq(messages.accountId, ctx.accountId),
        eq(messages.gmailThreadId, row[0].gmailThreadId),
      ),
    );
  debug("trashMessage done", {
    gmailMessageId: ctx.gmailMessageId,
    threadId: row[0].gmailThreadId,
  });
  return { ok: true, threadId: row[0].gmailThreadId };
}

export type BatchMessageAction = "read" | "archive" | "trash";

export interface BatchModifyMessagesResult {
  ok: true;
  action: BatchMessageAction;
  count: number;
}

async function resolveAccountContext(args: {
  accountId?: string;
  accountEmail?: string;
  gog?: GogAdapter;
}): Promise<{ accountId: string; accountEmail: string; gog: GogAdapter }> {
  const gog = args.gog ?? createGogAdapter();
  if (args.accountEmail) {
    const acc = await getAccountByEmail(args.accountEmail);
    if (!acc) throw new Error(`Account not synced: ${args.accountEmail}`);
    return { accountId: acc.id, accountEmail: acc.email, gog };
  }
  if (!args.accountId) {
    throw new Error("accountEmail or accountId is required");
  }
  const { db } = getDb();
  const { accounts } = await import("../db/schema");
  const rows = await db
    .select({ id: accounts.id, email: accounts.email })
    .from(accounts)
    .where(eq(accounts.id, args.accountId))
    .limit(1);
  if (rows.length === 0) {
    throw new Error(`Account not found: ${args.accountId}`);
  }
  return { accountId: rows[0].id, accountEmail: rows[0].email, gog };
}

export async function batchModifyMessages(args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageIds: string[];
  action: BatchMessageAction;
  gog?: GogAdapter;
}): Promise<BatchModifyMessagesResult> {
  debug("batchModifyMessages", {
    action: args.action,
    count: args.gmailMessageIds.length,
  });

  if (args.gmailMessageIds.length === 0) {
    return { ok: true, action: args.action, count: 0 };
  }

  const ctx = await resolveAccountContext(args);
  const { db } = getDb();
  const { messages } = await import("../db/schema");

  const addGmailLabels: string[] = [];
  const removeGmailLabels: string[] = [];
  if (args.action === "read") {
    removeGmailLabels.push("UNREAD");
  } else if (args.action === "archive") {
    removeGmailLabels.push("INBOX");
  } else if (args.action === "trash") {
    addGmailLabels.push("TRASH");
    removeGmailLabels.push("INBOX");
  }

  await ctx.gog.batchModifyLabels({
    account: ctx.accountEmail,
    messageIds: args.gmailMessageIds,
    add: addGmailLabels.length ? addGmailLabels : undefined,
    remove: removeGmailLabels.length ? removeGmailLabels : undefined,
  });

  const affectedGmailLabelIds = [...addGmailLabels, ...removeGmailLabels];
  const labelRows = affectedGmailLabelIds.length
    ? await db
        .select({ id: labels.id, gmailLabelId: labels.gmailLabelId })
        .from(labels)
        .where(
          and(
            eq(labels.accountId, ctx.accountId),
            inArray(labels.gmailLabelId, affectedGmailLabelIds),
          ),
        )
    : [];
  const labelByGmailId = new Map(labelRows.map((l) => [l.gmailLabelId, l.id]));

  for (const gmailLabelId of removeGmailLabels) {
    const labelId = labelByGmailId.get(gmailLabelId);
    if (!labelId) continue;
    await db
      .delete(messageLabels)
      .where(
        and(
          eq(messageLabels.accountId, ctx.accountId),
          inArray(messageLabels.gmailMessageId, args.gmailMessageIds),
          eq(messageLabels.labelId, labelId),
        ),
      );
  }
  for (const gmailLabelId of addGmailLabels) {
    const labelId = labelByGmailId.get(gmailLabelId);
    if (!labelId) continue;
    await db
      .insert(messageLabels)
      .values(
        args.gmailMessageIds.map((gmailMessageId) => ({
          accountId: ctx.accountId,
          gmailMessageId,
          labelId,
        })),
      )
      .onConflictDoNothing();
  }

  if (args.action === "archive" || args.action === "trash") {
    const patch =
      args.action === "archive" ? { isArchived: true } : { isTrashed: true };
    await db
      .update(messages)
      .set(patch)
      .where(
        and(
          eq(messages.accountId, ctx.accountId),
          inArray(messages.gmailMessageId, args.gmailMessageIds),
        ),
      );
  }

  debug("batchModifyMessages done", {
    action: args.action,
    count: args.gmailMessageIds.length,
  });
  return { ok: true, action: args.action, count: args.gmailMessageIds.length };
}

export async function setMessageRead(args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  read: boolean;
  gog?: GogAdapter;
}): Promise<{ ok: true; read: boolean }> {
  debug("setMessageRead", {
    gmailMessageId: args.gmailMessageId,
    read: args.read,
  });
  const ctx = await resolveContext(args);
  const { db } = getDb();

  const unreadRow = await db
    .select({ id: labels.id })
    .from(labels)
    .where(
      and(eq(labels.accountId, ctx.accountId), eq(labels.gmailLabelId, "UNREAD")),
    )
    .limit(1);

  await ctx.gog.batchModifyLabels({
    account: ctx.accountEmail,
    messageIds: [ctx.gmailMessageId],
    add: args.read ? undefined : ["UNREAD"],
    remove: args.read ? ["UNREAD"] : undefined,
  });

  if (unreadRow.length > 0) {
    const unreadLabelId = unreadRow[0].id;
    if (args.read) {
      await db
        .delete(messageLabels)
        .where(
          and(
            eq(messageLabels.accountId, ctx.accountId),
            eq(messageLabels.gmailMessageId, ctx.gmailMessageId),
            eq(messageLabels.labelId, unreadLabelId),
          ),
        );
    } else {
      await db
        .insert(messageLabels)
        .values({
          accountId: ctx.accountId,
          gmailMessageId: ctx.gmailMessageId,
          labelId: unreadLabelId,
        })
        .onConflictDoNothing();
    }
  }

  debug("setMessageRead done", {
    gmailMessageId: ctx.gmailMessageId,
    read: args.read,
  });
  return { ok: true, read: args.read };
}

export interface LatestTriageForMessage {
  triageId: string;
  priority: "high" | "medium" | "low";
  existingLabelSuggestions: {
    labelId: string;
    name: string;
    status: "pending" | "applied" | "dismissed";
  }[];
  newLabelSuggestions: {
    suggestionId: string;
    name: string;
    status: "pending" | "applied" | "dismissed";
  }[];
}

export async function getLatestTriageForMessage(args: {
  accountId: string;
  gmailMessageId: string;
}): Promise<LatestTriageForMessage | null> {
  const { db } = getDb();
  const t = await db
    .select({
      id: triages.id,
      priority: triages.priority,
    })
    .from(triages)
    .where(
      and(
        eq(triages.accountId, args.accountId),
        eq(triages.gmailMessageId, args.gmailMessageId),
      ),
    )
    .orderBy(sql`${triages.createdAt} desc`)
    .limit(1);
  if (t.length === 0) return null;
  const triageId = t[0].id;

  const existing = await db
    .select({
      labelId: triageLabelSuggestions.labelId,
      status: triageLabelSuggestions.status,
      name: labels.name,
    })
    .from(triageLabelSuggestions)
    .innerJoin(labels, eq(triageLabelSuggestions.labelId, labels.id))
    .where(eq(triageLabelSuggestions.triageId, triageId));

  const proposed = await db
    .select({
      suggestionId: suggestedLabels.id,
      name: suggestedLabels.name,
      status: suggestedLabels.status,
    })
    .from(suggestedLabels)
    .where(eq(suggestedLabels.triageId, triageId));

  return {
    triageId,
    priority: t[0].priority,
    existingLabelSuggestions: existing.map((e) => ({
      labelId: e.labelId,
      name: e.name,
      status: e.status,
    })),
    newLabelSuggestions: proposed,
  };
}
