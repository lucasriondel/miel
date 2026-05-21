import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  accounts,
  gmailFilters,
  labels,
  suggestedFilters,
} from "../db/schema";
import { createGogAdapter, type GogAdapter } from "../adapters/gog";
import { createClaudeAdapter, type ClaudeAdapter } from "../adapters/claude";
import { ShellError } from "../adapters/shell";
import type { GogFilterT } from "../schemas/gmail";
import { FilterSuggestInput } from "../schemas/filterSuggest";
import { createDebug } from "../util/debug";
import {
  getLabelsForAccount,
  syncLabelsForAccount,
  type LabelRow,
} from "./labels";

const debug = createDebug("service:filters");

export interface GmailFilterRow {
  id: string;
  accountId: string;
  gmailFilterId: string;
  criteria: Record<string, unknown>;
  action: Record<string, unknown>;
  syncedAt: Date;
}

export interface SuggestedFilterRow {
  id: string;
  accountId: string;
  criteriaFrom: string | null;
  criteriaSubject: string | null;
  criteriaQuery: string | null;
  addLabelId: string | null;
  addLabelName: string;
  reasoning: string | null;
  status: "pending" | "accepted" | "dismissed";
  createdGmailFilterId: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

const FILTER_RETURNING = {
  id: gmailFilters.id,
  accountId: gmailFilters.accountId,
  gmailFilterId: gmailFilters.gmailFilterId,
  criteria: gmailFilters.criteria,
  action: gmailFilters.action,
  syncedAt: gmailFilters.syncedAt,
};

const SUGGESTED_RETURNING = {
  id: suggestedFilters.id,
  accountId: suggestedFilters.accountId,
  criteriaFrom: suggestedFilters.criteriaFrom,
  criteriaSubject: suggestedFilters.criteriaSubject,
  criteriaQuery: suggestedFilters.criteriaQuery,
  addLabelId: suggestedFilters.addLabelId,
  addLabelName: suggestedFilters.addLabelName,
  reasoning: suggestedFilters.reasoning,
  status: suggestedFilters.status,
  createdGmailFilterId: suggestedFilters.createdGmailFilterId,
  createdAt: suggestedFilters.createdAt,
  decidedAt: suggestedFilters.decidedAt,
};

export async function syncFiltersForAccount(args: {
  accountId: string;
  accountEmail: string;
  gog?: GogAdapter;
}): Promise<GmailFilterRow[]> {
  debug("syncFiltersForAccount", { account: args.accountEmail });
  const gog = args.gog ?? createGogAdapter();
  const { db } = getDb();
  const remote = await gog.listFilters({ account: args.accountEmail });

  const remoteIds = remote.map((f) => f.id);
  if (remote.length === 0) {
    await db
      .delete(gmailFilters)
      .where(eq(gmailFilters.accountId, args.accountId));
    debug("syncFiltersForAccount empty", { account: args.accountEmail });
    return [];
  }

  const values = remote.map((f) => ({
    accountId: args.accountId,
    gmailFilterId: f.id,
    criteria: (f.criteria ?? {}) as Record<string, unknown>,
    action: (f.action ?? {}) as Record<string, unknown>,
    syncedAt: new Date(),
  }));

  const upserted = await db
    .insert(gmailFilters)
    .values(values)
    .onConflictDoUpdate({
      target: [gmailFilters.accountId, gmailFilters.gmailFilterId],
      set: {
        criteria: sql`excluded.criteria`,
        action: sql`excluded.action`,
        syncedAt: sql`excluded.synced_at`,
      },
    })
    .returning(FILTER_RETURNING);

  await db
    .delete(gmailFilters)
    .where(
      and(
        eq(gmailFilters.accountId, args.accountId),
        notInArray(gmailFilters.gmailFilterId, remoteIds),
      ),
    );

  debug("syncFiltersForAccount done", {
    account: args.accountEmail,
    upserted: upserted.length,
  });
  return upserted as GmailFilterRow[];
}

export async function listFiltersForAccount(
  accountId: string,
): Promise<GmailFilterRow[]> {
  const { db } = getDb();
  const rows = await db
    .select(FILTER_RETURNING)
    .from(gmailFilters)
    .where(eq(gmailFilters.accountId, accountId));
  return rows as GmailFilterRow[];
}

export async function listAllFilters(): Promise<GmailFilterRow[]> {
  const { db } = getDb();
  const rows = await db.select(FILTER_RETURNING).from(gmailFilters);
  return rows as GmailFilterRow[];
}

export interface SuggestedFilterWithAccount extends SuggestedFilterRow {
  accountEmail: string;
}

export async function listSuggestedFilters(args: {
  accountId?: string;
  status?: "pending" | "accepted" | "dismissed";
}): Promise<SuggestedFilterWithAccount[]> {
  const { db } = getDb();
  const conds = [] as ReturnType<typeof eq>[];
  if (args.accountId) conds.push(eq(suggestedFilters.accountId, args.accountId));
  if (args.status) conds.push(eq(suggestedFilters.status, args.status));

  const rows = await db
    .select({
      ...SUGGESTED_RETURNING,
      accountEmail: accounts.email,
    })
    .from(suggestedFilters)
    .innerJoin(accounts, eq(accounts.id, suggestedFilters.accountId))
    .where(conds.length > 0 ? and(...conds) : undefined);
  return rows as SuggestedFilterWithAccount[];
}

export interface SuggestFiltersForBatchArgs {
  accountId: string;
  accountEmail: string;
  messages: {
    id: string;
    from: string;
    subject: string | null;
    snippet: string | null;
    currentLabels: string[];
  }[];
  claude?: ClaudeAdapter;
}

export interface SuggestFiltersForBatchResult {
  created: number;
  skipped: number;
  proposals: SuggestedFilterRow[];
}

export async function suggestFiltersForBatch(
  args: SuggestFiltersForBatchArgs,
): Promise<SuggestFiltersForBatchResult> {
  if (args.messages.length === 0) {
    return { created: 0, skipped: 0, proposals: [] };
  }
  const claude = args.claude ?? createClaudeAdapter();
  const { db } = getDb();

  const allLabels = await getLabelsForAccount(args.accountId);
  const labelsByName = new Map<string, LabelRow>(
    allLabels.map((l) => [l.name, l]),
  );
  const existingLabelNames = allLabels
    .filter((l) => l.type === "user")
    .map((l) => l.name);

  const existingFilterRows = await listFiltersForAccount(args.accountId);
  const labelsByGmailId = new Map(allLabels.map((l) => [l.gmailLabelId, l]));
  const existingFiltersForPrompt = existingFilterRows.map((f) => {
    const criteria = f.criteria as {
      from?: string;
      subject?: string;
      query?: string;
    };
    const action = f.action as { addLabelIds?: string[] };
    const firstLabelId = action.addLabelIds?.[0];
    const labelName = firstLabelId
      ? labelsByGmailId.get(firstLabelId)?.name
      : undefined;
    return {
      criteriaFrom: criteria.from,
      criteriaSubject: criteria.subject,
      criteriaQuery: criteria.query,
      addLabelName: labelName,
    };
  });

  const input = FilterSuggestInput.parse({
    account: args.accountEmail,
    existingLabels: existingLabelNames,
    existingFilters: existingFiltersForPrompt,
    messages: args.messages,
  });

  debug("suggestFiltersForBatch invoking claude", {
    account: args.accountEmail,
    messages: input.messages.length,
    existingFilters: input.existingFilters.length,
  });

  const { output } = await claude.runFilterSuggest(input);

  const existingPendingForAccount = await db
    .select(SUGGESTED_RETURNING)
    .from(suggestedFilters)
    .where(
      and(
        eq(suggestedFilters.accountId, args.accountId),
        eq(suggestedFilters.status, "pending"),
      ),
    );
  const pendingKey = (s: {
    criteriaFrom: string | null;
    criteriaSubject: string | null;
    criteriaQuery: string | null;
    addLabelName: string;
  }) =>
    [
      s.criteriaFrom ?? "",
      s.criteriaSubject ?? "",
      s.criteriaQuery ?? "",
      s.addLabelName,
    ].join("|");
  const seen = new Set(
    existingPendingForAccount.map((s) => pendingKey(s as SuggestedFilterRow)),
  );

  let created = 0;
  let skipped = 0;
  const proposals: SuggestedFilterRow[] = [];

  for (const s of output.suggestions) {
    const matchedLabel = labelsByName.get(s.addLabelName);
    if (!matchedLabel) {
      skipped += 1;
      continue;
    }
    const key = pendingKey({
      criteriaFrom: s.criteriaFrom ?? null,
      criteriaSubject: s.criteriaSubject ?? null,
      criteriaQuery: s.criteriaQuery ?? null,
      addLabelName: s.addLabelName,
    });
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);

    const inserted = await db
      .insert(suggestedFilters)
      .values({
        accountId: args.accountId,
        criteriaFrom: s.criteriaFrom ?? null,
        criteriaSubject: s.criteriaSubject ?? null,
        criteriaQuery: s.criteriaQuery ?? null,
        addLabelId: matchedLabel.id,
        addLabelName: s.addLabelName,
        reasoning: s.reasoning,
      })
      .returning(SUGGESTED_RETURNING);
    created += 1;
    proposals.push(inserted[0] as SuggestedFilterRow);
  }

  debug("suggestFiltersForBatch done", {
    account: args.accountEmail,
    created,
    skipped,
  });
  return { created, skipped, proposals };
}

function isAlreadyExistsShellError(err: unknown): err is ShellError {
  if (!(err instanceof ShellError)) return false;
  const msg = `${err.stderr} ${err.message}`.toLowerCase();
  return (
    msg.includes("filter already exists") ||
    msg.includes("failedprecondition")
  );
}

async function findExistingMatchingFilter(args: {
  accountId: string;
  accountEmail: string;
  criteriaFrom: string | null;
  criteriaSubject: string | null;
  criteriaQuery: string | null;
  addLabelName: string;
  gog: GogAdapter;
}): Promise<string | null> {
  await syncFiltersForAccount({
    accountId: args.accountId,
    accountEmail: args.accountEmail,
    gog: args.gog,
  });
  const remote = await listFiltersForAccount(args.accountId);
  const allLabels = await getLabelsForAccount(args.accountId);
  const labelsByGmailId = new Map(allLabels.map((l) => [l.gmailLabelId, l]));
  for (const f of remote) {
    const c = f.criteria as {
      from?: string;
      subject?: string;
      query?: string;
    };
    const a = f.action as { addLabelIds?: string[] };
    const addsTargetLabel = (a.addLabelIds ?? []).some(
      (id) => labelsByGmailId.get(id)?.name === args.addLabelName,
    );
    if (!addsTargetLabel) continue;
    if ((c.from ?? null) !== args.criteriaFrom) continue;
    if ((c.subject ?? null) !== args.criteriaSubject) continue;
    if ((c.query ?? null) !== args.criteriaQuery) continue;
    return f.gmailFilterId;
  }
  return null;
}

export async function acceptSuggestedFilter(args: {
  suggestionId: string;
  gog?: GogAdapter;
}): Promise<{
  suggestion: SuggestedFilterRow;
  createdGmailFilterId: string;
  alreadyExisted: boolean;
}> {
  const gog = args.gog ?? createGogAdapter();
  const { db } = getDb();
  const rows = await db
    .select({
      ...SUGGESTED_RETURNING,
      accountEmail: accounts.email,
    })
    .from(suggestedFilters)
    .innerJoin(accounts, eq(accounts.id, suggestedFilters.accountId))
    .where(eq(suggestedFilters.id, args.suggestionId))
    .limit(1);
  if (rows.length === 0) throw new Error("suggestion not found");
  const s = rows[0];
  if (s.status !== "pending") {
    throw new Error(`suggestion already ${s.status}`);
  }

  const remoteLabels = await gog.listLabels({ account: s.accountEmail });
  const remoteByName = new Map(remoteLabels.map((l) => [l.name, l]));
  let gmailLabelId = remoteByName.get(s.addLabelName)?.id;
  if (!gmailLabelId) {
    const created = await gog.createLabel({
      account: s.accountEmail,
      name: s.addLabelName,
    });
    gmailLabelId = created.id;
  }
  await syncLabelsForAccount({
    accountId: s.accountId,
    accountEmail: s.accountEmail,
    gog,
  });

  let createdGmailFilterId: string;
  let alreadyExisted = false;
  try {
    const created = await gog.createFilter({
      account: s.accountEmail,
      from: s.criteriaFrom ?? undefined,
      subject: s.criteriaSubject ?? undefined,
      query: s.criteriaQuery ?? undefined,
      addLabel: gmailLabelId,
    });
    createdGmailFilterId = created.id;
  } catch (err) {
    if (!isAlreadyExistsShellError(err)) throw err;
    alreadyExisted = true;
    const matchedId = await findExistingMatchingFilter({
      accountId: s.accountId,
      accountEmail: s.accountEmail,
      criteriaFrom: s.criteriaFrom,
      criteriaSubject: s.criteriaSubject,
      criteriaQuery: s.criteriaQuery,
      addLabelName: s.addLabelName,
      gog,
    });
    if (!matchedId) {
      throw new Error(
        "Gmail reports this filter already exists, but it could not be located when re-syncing filters.",
      );
    }
    createdGmailFilterId = matchedId;
  }

  if (!alreadyExisted) {
    await syncFiltersForAccount({
      accountId: s.accountId,
      accountEmail: s.accountEmail,
      gog,
    });
  }

  const updated = await db
    .update(suggestedFilters)
    .set({
      status: "accepted",
      createdGmailFilterId,
      decidedAt: new Date(),
    })
    .where(eq(suggestedFilters.id, args.suggestionId))
    .returning(SUGGESTED_RETURNING);

  return {
    suggestion: updated[0] as SuggestedFilterRow,
    createdGmailFilterId,
    alreadyExisted,
  };
}

export async function dismissSuggestedFilter(
  suggestionId: string,
): Promise<SuggestedFilterRow> {
  const { db } = getDb();
  const updated = await db
    .update(suggestedFilters)
    .set({ status: "dismissed", decidedAt: new Date() })
    .where(eq(suggestedFilters.id, suggestionId))
    .returning(SUGGESTED_RETURNING);
  if (updated.length === 0) throw new Error("suggestion not found");
  return updated[0] as SuggestedFilterRow;
}

export async function getLabelIdsByGmailIds(args: {
  accountId: string;
  gmailLabelIds: string[];
}): Promise<Map<string, LabelRow>> {
  if (args.gmailLabelIds.length === 0) return new Map();
  const { db } = getDb();
  const rows = await db
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
        eq(labels.accountId, args.accountId),
        inArray(labels.gmailLabelId, args.gmailLabelIds),
      ),
    );
  return new Map(rows.map((r) => [r.gmailLabelId, r]));
}

export type { GogFilterT };
