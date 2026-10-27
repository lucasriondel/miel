import { Effect, Either } from "effect";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { accounts, gmailFilters, labels } from "../db/schema";
import { createGmailAdapter, type GmailDataAdapter } from "../google/gmailAdapter";
import { FilterMergeError } from "../errors";
import type { GogFilterT } from "../schemas/gmail";
import { createDebug } from "../util/debug";
import { toError, tryAsync } from "../util/effect";
import { runWithStores } from "../stores/postgres";
import { buildMergedFilterSpec } from "./filterMerge";
import type { LabelRow } from "./labels";

const debug = createDebug("service:filters");

export interface GmailFilterRow {
  id: string;
  accountId: string;
  gmailFilterId: string;
  criteria: Record<string, unknown>;
  action: Record<string, unknown>;
  syncedAt: Date;
}

const FILTER_RETURNING = {
  id: gmailFilters.id,
  accountId: gmailFilters.accountId,
  gmailFilterId: gmailFilters.gmailFilterId,
  criteria: gmailFilters.criteria,
  action: gmailFilters.action,
  syncedAt: gmailFilters.syncedAt,
};

/**
 * Gmail echoes the filter it stored; fall back to what we asked for if the echo
 * comes back bare, so the local row is never emptier than the truth.
 */
const echoed = (o: Record<string, unknown> | undefined) =>
  o && Object.keys(o).length > 0 ? o : undefined;

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

export async function getLabelIdsByGmailIds(args: {
  accountId: string;
  gmailLabelIds: string[];
}): Promise<Map<string, LabelRow>> {
  return runWithStores(getLabelIdsByGmailIdsEffect(args));
}

export type { GogFilterT };
