import { Effect, Either } from "effect";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { accounts, gmailFilters, labels, suggestedFilters } from "../db/schema";
import { createGmailAdapter, type GmailDataAdapter } from "../google/gmailAdapter";
import { Claude, ClaudeLive } from "../claude/Claude";
import { ShellError } from "../adapters/shell";
import { FilterMergeError } from "../errors";
import type { GogFilterT } from "../schemas/gmail";
import { FilterSuggestInput } from "../schemas/filterSuggest";
import { createDebug } from "../util/debug";
import { toError, tryAsync } from "../util/effect";
import { LabelStore, MessageStore, TriageStore } from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { buildMergedFilterSpec } from "./filterMerge";
import { getLabelsForAccountEffect, syncLabelsForAccountEffect, type LabelRow } from "./labels";
import { getMessageDetailEffect } from "./messages";

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

/**
 * Gmail echoes the filter it stored; fall back to what we asked for if the echo
 * comes back bare, so the local row is never emptier than the truth.
 */
const echoed = (o: Record<string, unknown> | undefined) =>
  o && Object.keys(o).length > 0 ? o : undefined;

/** Identity of a pending suggestion — what makes two of them the same proposal. */
const pendingKey = (s: {
  criteriaFrom: string | null;
  criteriaSubject: string | null;
  criteriaQuery: string | null;
  addLabelName: string;
}) =>
  [s.criteriaFrom ?? "", s.criteriaSubject ?? "", s.criteriaQuery ?? "", s.addLabelName].join("|");

export const syncFiltersForAccountEffect = (args: {
  accountId: string;
  accountEmail: string;
  gmail?: GmailDataAdapter;
}): Effect.Effect<GmailFilterRow[], Error> =>
  Effect.gen(function* () {
    debug("syncFiltersForAccount", { account: args.accountEmail });
    const gmail = args.gmail ?? createGmailAdapter();
    const { db } = getDb();
    const remote = yield* tryAsync(() => gmail.listFilters({ account: args.accountEmail }));

    const remoteIds = remote.map((f) => f.id);
    if (remote.length === 0) {
      yield* Effect.promise(() =>
        db.delete(gmailFilters).where(eq(gmailFilters.accountId, args.accountId)),
      );
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

    const upserted = yield* Effect.promise(() =>
      db
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
        .returning(FILTER_RETURNING),
    );

    yield* Effect.promise(() =>
      db
        .delete(gmailFilters)
        .where(
          and(
            eq(gmailFilters.accountId, args.accountId),
            notInArray(gmailFilters.gmailFilterId, remoteIds),
          ),
        ),
    );

    debug("syncFiltersForAccount done", {
      account: args.accountEmail,
      upserted: upserted.length,
    });
    return upserted as GmailFilterRow[];
  });

export const listFiltersForAccountEffect = (accountId: string): Effect.Effect<GmailFilterRow[]> =>
  Effect.gen(function* () {
    const { db } = getDb();
    const rows = yield* Effect.promise(() =>
      db.select(FILTER_RETURNING).from(gmailFilters).where(eq(gmailFilters.accountId, accountId)),
    );
    return rows as GmailFilterRow[];
  });

export const listAllFiltersEffect = (): Effect.Effect<GmailFilterRow[]> =>
  Effect.gen(function* () {
    const { db } = getDb();
    const rows = yield* Effect.promise(() => db.select(FILTER_RETURNING).from(gmailFilters));
    return rows as GmailFilterRow[];
  });

/**
 * Delete one Gmail filter, then forget it locally.
 *
 * The lookup is scoped by `accountId`, so a filter id belonging to another
 * account simply doesn't match and the call is a no-op returning `null` — the
 * boundary turns that into a 404 rather than deleting anything. Gmail goes
 * first: if it rejects, the error propagates and the local row survives, so the
 * list keeps reflecting what Gmail actually holds. Deletion is not reversible —
 * a recreated filter gets a new id.
 *
 * Returns the row that was removed, or `null` when nothing matched.
 */
export const deleteFilterForAccountEffect = (args: {
  accountId: string;
  gmailFilterId: string;
  gmail?: GmailDataAdapter;
}): Effect.Effect<GmailFilterRow | null, Error> =>
  Effect.gen(function* () {
    const gmail = args.gmail ?? createGmailAdapter();
    const { db } = getDb();

    const scope = and(
      eq(gmailFilters.accountId, args.accountId),
      eq(gmailFilters.gmailFilterId, args.gmailFilterId),
    );
    const rows = yield* Effect.promise(() =>
      db
        .select({ ...FILTER_RETURNING, accountEmail: accounts.email })
        .from(gmailFilters)
        .innerJoin(accounts, eq(accounts.id, gmailFilters.accountId))
        .where(scope)
        .limit(1),
    );
    const found = rows[0] as (GmailFilterRow & { accountEmail: string }) | undefined;
    if (!found) {
      debug("deleteFilterForAccount not found", {
        account: args.accountId,
        filter: args.gmailFilterId,
      });
      return null;
    }

    const { accountEmail, ...row } = found;
    yield* tryAsync(() =>
      gmail.deleteFilter({
        account: accountEmail,
        filterId: row.gmailFilterId,
      }),
    );

    yield* Effect.promise(() => db.delete(gmailFilters).where(scope));

    debug("deleteFilterForAccount done", {
      account: accountEmail,
      filter: row.gmailFilterId,
    });
    return row;
  });

export interface FilterDeletionFailure {
  gmailFilterId: string;
  message: string;
}

export interface MergeFiltersResult {
  /** The newly created filter, as stored locally. */
  filter: GmailFilterRow;
  /** Source filters Gmail actually dropped (and so were forgotten locally). */
  deletedGmailFilterIds: string[];
  /** Sources Gmail refused to drop — they still exist, and still match. */
  failedDeletions: FilterDeletionFailure[];
}

/**
 * Merge 2+ of an account's filters into one.
 *
 * Gmail's criteria fields hold single strings, so the merged filter carries one
 * `query` criterion OR-ing the sources' terms, and one action that is the union
 * of theirs — see `filterMerge.ts` for that algebra, which runs first and fails
 * with `FilterMergeError` before anything is mutated.
 *
 * The mutation is ordered so no state is lost: the replacement is created in
 * Gmail and recorded locally *first*, then each source is deleted. A source
 * Gmail refuses to delete keeps its local row and is reported in
 * `failedDeletions` rather than silently dropped — the account then has both the
 * merged filter and that leftover, which is noisy but not lossy.
 *
 * The lookup is scoped by `accountId`, so ids belonging to another account are
 * simply not found and the merge is rejected (`reason: "unknown_filters"`)
 * without a single Gmail call.
 */
export const mergeFiltersForAccountEffect = (args: {
  accountId: string;
  gmailFilterIds: string[];
  gmail?: GmailDataAdapter;
}): Effect.Effect<MergeFiltersResult, Error> =>
  Effect.gen(function* () {
    const gmail = args.gmail ?? createGmailAdapter();
    const { db } = getDb();

    const ids = [...new Set(args.gmailFilterIds)];
    if (ids.length < 2) {
      return yield* Effect.fail(
        new FilterMergeError({
          reason: "too_few",
          message: "Merging needs at least 2 filters.",
          gmailFilterIds: ids,
        }),
      );
    }

    const found = (yield* Effect.promise(() =>
      db
        .select({ ...FILTER_RETURNING, accountEmail: accounts.email })
        .from(gmailFilters)
        .innerJoin(accounts, eq(accounts.id, gmailFilters.accountId))
        .where(
          and(eq(gmailFilters.accountId, args.accountId), inArray(gmailFilters.gmailFilterId, ids)),
        ),
    )) as (GmailFilterRow & { accountEmail: string })[];

    const byId = new Map(found.map((r) => [r.gmailFilterId, r]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      return yield* Effect.fail(
        new FilterMergeError({
          reason: "unknown_filters",
          message: `No such filter on this account: ${missing.join(", ")}.`,
          gmailFilterIds: missing,
        }),
      );
    }

    // Requested order, not row order — it's the order the user selected in.
    const sources = ids.map((id) => byId.get(id)!);
    const accountEmail = sources[0]!.accountEmail;

    const spec = yield* Effect.try({
      try: () =>
        buildMergedFilterSpec(
          sources.map((s) => ({
            gmailFilterId: s.gmailFilterId,
            criteria: s.criteria,
            action: s.action,
          })),
        ),
      catch: toError,
    });

    const action = {
      ...(spec.addLabelIds.length > 0 ? { addLabelIds: spec.addLabelIds } : {}),
      ...(spec.removeLabelIds.length > 0 ? { removeLabelIds: spec.removeLabelIds } : {}),
      ...(spec.forward ? { forward: spec.forward } : {}),
    };

    debug("mergeFiltersForAccount creating", {
      account: accountEmail,
      sources: ids,
      query: spec.query,
    });

    const created = yield* tryAsync(() =>
      gmail.createFilter({ account: accountEmail, query: spec.query, ...action }),
    );

    const inserted = yield* Effect.promise(() =>
      db
        .insert(gmailFilters)
        .values({
          accountId: args.accountId,
          gmailFilterId: created.id,
          criteria: echoed(created.criteria as Record<string, unknown>) ?? {
            query: spec.query,
          },
          action: echoed(created.action as Record<string, unknown>) ?? action,
          syncedAt: new Date(),
        })
        .returning(FILTER_RETURNING),
    );
    const filter = inserted[0] as GmailFilterRow;

    const deletedGmailFilterIds: string[] = [];
    const failedDeletions: FilterDeletionFailure[] = [];
    for (const source of sources) {
      const outcome = yield* Effect.either(
        tryAsync(() =>
          gmail.deleteFilter({
            account: accountEmail,
            filterId: source.gmailFilterId,
          }),
        ),
      );
      if (Either.isLeft(outcome)) {
        failedDeletions.push({
          gmailFilterId: source.gmailFilterId,
          message: outcome.left.message,
        });
      } else {
        deletedGmailFilterIds.push(source.gmailFilterId);
      }
    }

    // Only forget the rows Gmail actually dropped; the rest still exist there.
    if (deletedGmailFilterIds.length > 0) {
      yield* Effect.promise(() =>
        db
          .delete(gmailFilters)
          .where(
            and(
              eq(gmailFilters.accountId, args.accountId),
              inArray(gmailFilters.gmailFilterId, deletedGmailFilterIds),
            ),
          ),
      );
    }

    debug("mergeFiltersForAccount done", {
      account: accountEmail,
      merged: filter.gmailFilterId,
      deleted: deletedGmailFilterIds.length,
      failed: failedDeletions.length,
    });

    return { filter, deletedGmailFilterIds, failedDeletions };
  });

export interface SuggestedFilterWithAccount extends SuggestedFilterRow {
  accountEmail: string;
}

export const listSuggestedFiltersEffect = (args: {
  accountId?: string;
  status?: "pending" | "accepted" | "dismissed";
}): Effect.Effect<SuggestedFilterWithAccount[]> =>
  Effect.gen(function* () {
    const { db } = getDb();
    const conds = [] as ReturnType<typeof eq>[];
    if (args.accountId) conds.push(eq(suggestedFilters.accountId, args.accountId));
    if (args.status) conds.push(eq(suggestedFilters.status, args.status));

    const rows = yield* Effect.promise(() =>
      db
        .select({
          ...SUGGESTED_RETURNING,
          accountEmail: accounts.email,
        })
        .from(suggestedFilters)
        .innerJoin(accounts, eq(accounts.id, suggestedFilters.accountId))
        .where(conds.length > 0 ? and(...conds) : undefined),
    );
    return rows as SuggestedFilterWithAccount[];
  });

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
}

export interface SuggestFiltersForBatchResult {
  created: number;
  skipped: number;
  proposals: SuggestedFilterRow[];
}

export const suggestFiltersForBatchEffect = (
  args: SuggestFiltersForBatchArgs,
): Effect.Effect<SuggestFiltersForBatchResult, Error, Claude | LabelStore> =>
  Effect.gen(function* () {
    if (args.messages.length === 0) {
      return { created: 0, skipped: 0, proposals: [] };
    }
    const claude = yield* Claude;
    const { db } = getDb();

    const allLabels = yield* getLabelsForAccountEffect(args.accountId);
    const labelsByName = new Map<string, LabelRow>(allLabels.map((l) => [l.name, l]));
    const existingLabelNames = allLabels.filter((l) => l.type === "user").map((l) => l.name);

    const existingFilterRows = yield* listFiltersForAccountEffect(args.accountId);
    const labelsByGmailId = new Map(allLabels.map((l) => [l.gmailLabelId, l]));
    const existingFiltersForPrompt = existingFilterRows.map((f) => {
      const criteria = f.criteria as {
        from?: string;
        subject?: string;
        query?: string;
      };
      const action = f.action as { addLabelIds?: string[] };
      const firstLabelId = action.addLabelIds?.[0];
      const labelName = firstLabelId ? labelsByGmailId.get(firstLabelId)?.name : undefined;
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

    const { output } = yield* claude.run("filter", input);

    const existingPendingForAccount = yield* Effect.promise(() =>
      db
        .select(SUGGESTED_RETURNING)
        .from(suggestedFilters)
        .where(
          and(
            eq(suggestedFilters.accountId, args.accountId),
            eq(suggestedFilters.status, "pending"),
          ),
        ),
    );
    const seen = new Set(existingPendingForAccount.map((s) => pendingKey(s as SuggestedFilterRow)));

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

      const inserted = yield* Effect.promise(() =>
        db
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
          .returning(SUGGESTED_RETURNING),
      );
      created += 1;
      proposals.push(inserted[0] as SuggestedFilterRow);
    }

    debug("suggestFiltersForBatch done", {
      account: args.accountEmail,
      created,
      skipped,
    });
    return { created, skipped, proposals };
  });

export interface SuggestFilterForMessageArgs {
  accountId: string;
  gmailMessageId: string;
  /** Free-text steer from the "Filter similar" popover, passed to Claude. */
  prompt?: string;
}

export interface SuggestFilterForMessageResult {
  /** The persisted suggestion, or null when Claude returned nothing usable. */
  suggestion: SuggestedFilterRow | null;
  /** False when an identical pending suggestion already existed (deduped). */
  created: boolean;
}

/**
 * "Filter similar" message-row action: load one message, ask Claude for a
 * single Gmail-filter-like suggestion that would catch messages like it, and
 * persist it to `suggested_filters` so it surfaces on the Filters page.
 *
 * Unlike the batch path (which only keeps suggestions whose target label
 * already exists), this keeps a suggestion that proposes a brand-new label —
 * it persists with `addLabelId: null` and the label is created on accept.
 */
export const suggestFilterForMessageEffect = (
  args: SuggestFilterForMessageArgs,
): Effect.Effect<
  SuggestFilterForMessageResult,
  Error,
  Claude | MessageStore | TriageStore | LabelStore
> =>
  Effect.gen(function* () {
    const claude = yield* Claude;
    const { db } = getDb();

    const message = yield* getMessageDetailEffect({
      accountId: args.accountId,
      gmailMessageId: args.gmailMessageId,
    });
    if (!message) {
      return yield* Effect.fail(new Error("message not found"));
    }

    const allLabels = yield* getLabelsForAccountEffect(args.accountId);
    const labelsByName = new Map<string, LabelRow>(allLabels.map((l) => [l.name, l]));
    const existingLabelNames = allLabels.filter((l) => l.type === "user").map((l) => l.name);

    const existingFilterRows = yield* listFiltersForAccountEffect(args.accountId);
    const labelsByGmailId = new Map(allLabels.map((l) => [l.gmailLabelId, l]));
    const existingFiltersForPrompt = existingFilterRows.map((f) => {
      const criteria = f.criteria as {
        from?: string;
        subject?: string;
        query?: string;
      };
      const action = f.action as { addLabelIds?: string[] };
      const firstLabelId = action.addLabelIds?.[0];
      const labelName = firstLabelId ? labelsByGmailId.get(firstLabelId)?.name : undefined;
      return {
        criteriaFrom: criteria.from,
        criteriaSubject: criteria.subject,
        criteriaQuery: criteria.query,
        addLabelName: labelName,
      };
    });

    const fromHeader = message.fromName
      ? `${message.fromName} <${message.fromEmail}>`
      : message.fromEmail;

    const userInstruction = args.prompt?.trim() || undefined;
    const input = FilterSuggestInput.parse({
      account: message.accountEmail,
      existingLabels: existingLabelNames,
      existingFilters: existingFiltersForPrompt,
      messages: [
        {
          id: message.gmailMessageId,
          from: fromHeader,
          subject: message.subject,
          snippet: message.snippet,
          currentLabels: message.labels.map((l) => l.name),
        },
      ],
      userInstruction,
    });

    debug("suggestFilterForMessage invoking claude", {
      account: message.accountEmail,
      message: message.gmailMessageId,
      existingFilters: input.existingFilters.length,
    });

    const { output } = yield* claude.run("filter", input);
    const top = output.suggestions[0];
    if (!top) {
      debug("suggestFilterForMessage no suggestion", {
        account: message.accountEmail,
        message: message.gmailMessageId,
      });
      return { suggestion: null, created: false };
    }

    const criteriaFrom = top.criteriaFrom ?? null;
    const criteriaSubject = top.criteriaSubject ?? null;
    const criteriaQuery = top.criteriaQuery ?? null;

    const existing = yield* Effect.promise(() =>
      db
        .select(SUGGESTED_RETURNING)
        .from(suggestedFilters)
        .where(
          and(
            eq(suggestedFilters.accountId, args.accountId),
            eq(suggestedFilters.status, "pending"),
            eq(suggestedFilters.addLabelName, top.addLabelName),
          ),
        ),
    );
    const dupe = (existing as SuggestedFilterRow[]).find(
      (s) =>
        (s.criteriaFrom ?? null) === criteriaFrom &&
        (s.criteriaSubject ?? null) === criteriaSubject &&
        (s.criteriaQuery ?? null) === criteriaQuery,
    );
    if (dupe) {
      debug("suggestFilterForMessage duplicate", {
        account: message.accountEmail,
        addLabelName: top.addLabelName,
      });
      return { suggestion: dupe, created: false };
    }

    const matchedLabel = labelsByName.get(top.addLabelName);
    const inserted = yield* Effect.promise(() =>
      db
        .insert(suggestedFilters)
        .values({
          accountId: args.accountId,
          criteriaFrom,
          criteriaSubject,
          criteriaQuery,
          addLabelId: matchedLabel?.id ?? null,
          addLabelName: top.addLabelName,
          reasoning: top.reasoning,
        })
        .returning(SUGGESTED_RETURNING),
    );

    debug("suggestFilterForMessage done", {
      account: message.accountEmail,
      addLabelName: top.addLabelName,
    });
    return { suggestion: inserted[0] as SuggestedFilterRow, created: true };
  });

function isAlreadyExistsShellError(err: unknown): err is ShellError {
  if (!(err instanceof ShellError)) return false;
  const msg = `${err.stderr} ${err.message}`.toLowerCase();
  return msg.includes("filter already exists") || msg.includes("failedprecondition");
}

const findExistingMatchingFilterEffect = (args: {
  accountId: string;
  accountEmail: string;
  criteriaFrom: string | null;
  criteriaSubject: string | null;
  criteriaQuery: string | null;
  addLabelName: string;
  gmail: GmailDataAdapter;
}): Effect.Effect<string | null, Error, LabelStore> =>
  Effect.gen(function* () {
    yield* syncFiltersForAccountEffect({
      accountId: args.accountId,
      accountEmail: args.accountEmail,
      gmail: args.gmail,
    });
    const remote = yield* listFiltersForAccountEffect(args.accountId);
    const allLabels = yield* getLabelsForAccountEffect(args.accountId);
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
  });

export const acceptSuggestedFilterEffect = (args: {
  suggestionId: string;
  gmail?: GmailDataAdapter;
}): Effect.Effect<
  {
    suggestion: SuggestedFilterRow;
    createdGmailFilterId: string;
    alreadyExisted: boolean;
  },
  Error,
  LabelStore
> =>
  Effect.gen(function* () {
    const gmail = args.gmail ?? createGmailAdapter();
    const { db } = getDb();
    const rows = yield* Effect.promise(() =>
      db
        .select({
          ...SUGGESTED_RETURNING,
          accountEmail: accounts.email,
        })
        .from(suggestedFilters)
        .innerJoin(accounts, eq(accounts.id, suggestedFilters.accountId))
        .where(eq(suggestedFilters.id, args.suggestionId))
        .limit(1),
    );
    if (rows.length === 0) {
      return yield* Effect.fail(new Error("suggestion not found"));
    }
    const s = rows[0];
    if (s.status !== "pending") {
      return yield* Effect.fail(new Error(`suggestion already ${s.status}`));
    }

    const remoteLabels = yield* tryAsync(() => gmail.listLabels({ account: s.accountEmail }));
    const remoteByName = new Map(remoteLabels.map((l) => [l.name, l]));
    let gmailLabelId = remoteByName.get(s.addLabelName)?.id;
    if (!gmailLabelId) {
      const created = yield* tryAsync(() =>
        gmail.createLabel({
          account: s.accountEmail,
          name: s.addLabelName,
        }),
      );
      gmailLabelId = created.id;
    }
    yield* syncLabelsForAccountEffect({
      accountId: s.accountId,
      accountEmail: s.accountEmail,
      gmail,
    });

    let createdGmailFilterId: string;
    let alreadyExisted = false;
    const createResult = yield* Effect.either(
      tryAsync(() =>
        gmail.createFilter({
          account: s.accountEmail,
          from: s.criteriaFrom ?? undefined,
          subject: s.criteriaSubject ?? undefined,
          query: s.criteriaQuery ?? undefined,
          addLabel: gmailLabelId,
        }),
      ),
    );
    if (Either.isLeft(createResult)) {
      const err = createResult.left;
      if (!isAlreadyExistsShellError(err)) {
        return yield* Effect.fail(err);
      }
      alreadyExisted = true;
      const matchedId = yield* findExistingMatchingFilterEffect({
        accountId: s.accountId,
        accountEmail: s.accountEmail,
        criteriaFrom: s.criteriaFrom,
        criteriaSubject: s.criteriaSubject,
        criteriaQuery: s.criteriaQuery,
        addLabelName: s.addLabelName,
        gmail,
      });
      if (!matchedId) {
        return yield* Effect.fail(
          new Error(
            "Gmail reports this filter already exists, but it could not be located when re-syncing filters.",
          ),
        );
      }
      createdGmailFilterId = matchedId;
    } else {
      createdGmailFilterId = createResult.right.id;
    }

    if (!alreadyExisted) {
      yield* syncFiltersForAccountEffect({
        accountId: s.accountId,
        accountEmail: s.accountEmail,
        gmail,
      });
    }

    const updated = yield* Effect.promise(() =>
      db
        .update(suggestedFilters)
        .set({
          status: "accepted",
          createdGmailFilterId,
          decidedAt: new Date(),
        })
        .where(eq(suggestedFilters.id, args.suggestionId))
        .returning(SUGGESTED_RETURNING),
    );

    return {
      suggestion: updated[0] as SuggestedFilterRow,
      createdGmailFilterId,
      alreadyExisted,
    };
  });

export const dismissSuggestedFilterEffect = (
  suggestionId: string,
): Effect.Effect<SuggestedFilterRow, Error> =>
  Effect.gen(function* () {
    const { db } = getDb();
    const updated = yield* Effect.promise(() =>
      db
        .update(suggestedFilters)
        .set({ status: "dismissed", decidedAt: new Date() })
        .where(eq(suggestedFilters.id, suggestionId))
        .returning(SUGGESTED_RETURNING),
    );
    if (updated.length === 0) {
      return yield* Effect.fail(new Error("suggestion not found"));
    }
    return updated[0] as SuggestedFilterRow;
  });

export const getLabelIdsByGmailIdsEffect = (args: {
  accountId: string;
  gmailLabelIds: string[];
}): Effect.Effect<Map<string, LabelRow>> =>
  Effect.gen(function* () {
    if (args.gmailLabelIds.length === 0) return new Map();
    const { db } = getDb();
    const rows = yield* Effect.promise(() =>
      db
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
        ),
    );
    return new Map(rows.map((r) => [r.gmailLabelId, r]));
  });

// Promise facades for the API/CLI boundary.
export async function syncFiltersForAccount(args: {
  accountId: string;
  accountEmail: string;
  gmail?: GmailDataAdapter;
}): Promise<GmailFilterRow[]> {
  return runWithStores(syncFiltersForAccountEffect(args));
}

export async function listFiltersForAccount(accountId: string): Promise<GmailFilterRow[]> {
  return runWithStores(listFiltersForAccountEffect(accountId));
}

export async function listAllFilters(): Promise<GmailFilterRow[]> {
  return runWithStores(listAllFiltersEffect());
}

export async function deleteFilterForAccount(args: {
  accountId: string;
  gmailFilterId: string;
  gmail?: GmailDataAdapter;
}): Promise<GmailFilterRow | null> {
  return runWithStores(deleteFilterForAccountEffect(args));
}

export async function mergeFiltersForAccount(args: {
  accountId: string;
  gmailFilterIds: string[];
  gmail?: GmailDataAdapter;
}): Promise<MergeFiltersResult> {
  return runWithStores(mergeFiltersForAccountEffect(args));
}

export async function listSuggestedFilters(args: {
  accountId?: string;
  status?: "pending" | "accepted" | "dismissed";
}): Promise<SuggestedFilterWithAccount[]> {
  return runWithStores(listSuggestedFiltersEffect(args));
}

export async function suggestFiltersForBatch(
  args: SuggestFiltersForBatchArgs,
): Promise<SuggestFiltersForBatchResult> {
  return runWithStores(Effect.provide(suggestFiltersForBatchEffect(args), ClaudeLive));
}

export async function suggestFilterForMessage(
  args: SuggestFilterForMessageArgs,
): Promise<SuggestFilterForMessageResult> {
  return runWithStores(Effect.provide(suggestFilterForMessageEffect(args), ClaudeLive));
}

export async function acceptSuggestedFilter(args: {
  suggestionId: string;
  gmail?: GmailDataAdapter;
}): Promise<{
  suggestion: SuggestedFilterRow;
  createdGmailFilterId: string;
  alreadyExisted: boolean;
}> {
  return runWithStores(acceptSuggestedFilterEffect(args));
}

export async function dismissSuggestedFilter(suggestionId: string): Promise<SuggestedFilterRow> {
  return runWithStores(dismissSuggestedFilterEffect(suggestionId));
}

export async function getLabelIdsByGmailIds(args: {
  accountId: string;
  gmailLabelIds: string[];
}): Promise<Map<string, LabelRow>> {
  return runWithStores(getLabelIdsByGmailIdsEffect(args));
}

export type { GogFilterT };
