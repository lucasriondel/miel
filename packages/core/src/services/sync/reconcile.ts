import { Effect } from "effect";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb } from "../../db/client";
import { messages } from "../../db/schema";
import { createDebug } from "../../util/debug";

const debug = createDebug("service:sync:reconcile");

export interface ReconcileDiffInput {
  /** All messages currently in DB whose internalDate falls in the synced window. */
  existing: { gmailMessageId: string; removedAt: Date | null }[];
  /** The gmailMessageIds Gmail returned for this window during this sync. */
  hits: Set<string>;
  /**
   * True when the Gmail search hit its `maxResults` cap — in that case we have
   * an incomplete view of the window and cannot safely conclude "missing from
   * hits ⇒ removed". We still trust positive observations (restore).
   */
  capReached: boolean;
}

export interface ReconcileDiffResult {
  toRemove: string[];
  toRestore: string[];
}

/**
 * Pure: given the local snapshot of messages in a sync window and the set of
 * Gmail messageIds returned for that window, return which ones should be
 * soft-removed and which previously-removed ones should be restored.
 */
export function reconcileDiff(args: ReconcileDiffInput): ReconcileDiffResult {
  const toRemove: string[] = [];
  const toRestore: string[] = [];
  for (const row of args.existing) {
    const seen = args.hits.has(row.gmailMessageId);
    if (seen && row.removedAt !== null) {
      toRestore.push(row.gmailMessageId);
    } else if (!seen && row.removedAt === null && !args.capReached) {
      toRemove.push(row.gmailMessageId);
    }
  }
  return { toRemove, toRestore };
}

export interface ReconcileStepArgs {
  accountId: string;
  accountEmail: string;
  rangeFrom: Date;
  rangeTo: Date;
  hits: Set<string>;
  capReached: boolean;
  log: (msg: string) => void;
}

export interface ReconcileStepResult {
  removed: number;
  restored: number;
  windowSize: number;
}

/**
 * Reconcile the DB against the Gmail search for the synced date window:
 *   - mark messages we previously fetched but Gmail no longer returns as
 *     removed (soft-delete via `removedAt`)
 *   - restore messages we'd previously marked removed but Gmail returns again
 *
 * Soft-only: triages and labels stay attached so history is preserved.
 */
export const stepReconcileRemovedMessages = (
  args: ReconcileStepArgs,
): Effect.Effect<ReconcileStepResult> =>
  Effect.gen(function* () {
    const { db } = getDb();

    const existing = yield* Effect.promise(() =>
      db
        .select({
          gmailMessageId: messages.gmailMessageId,
          removedAt: messages.removedAt,
        })
        .from(messages)
        .where(
          and(
            eq(messages.accountId, args.accountId),
            gte(messages.internalDate, args.rangeFrom),
            lte(messages.internalDate, args.rangeTo),
          ),
        ),
    );

    const diff = reconcileDiff({
      existing,
      hits: args.hits,
      capReached: args.capReached,
    });

    if (diff.toRemove.length > 0) {
      const now = new Date();
      yield* Effect.promise(() =>
        db
          .update(messages)
          .set({ removedAt: now })
          .where(
            and(
              eq(messages.accountId, args.accountId),
              inArray(messages.gmailMessageId, diff.toRemove),
              isNull(messages.removedAt),
            ),
          ),
      );
    }

    if (diff.toRestore.length > 0) {
      yield* Effect.promise(() =>
        db
          .update(messages)
          .set({ removedAt: null })
          .where(
            and(
              eq(messages.accountId, args.accountId),
              inArray(messages.gmailMessageId, diff.toRestore),
            ),
          ),
      );
    }

    if (args.capReached && existing.length > args.hits.size) {
      args.log(
        `[${args.accountEmail}] skipping removed-reconcile: hit search cap (max=${args.hits.size}), DB has ${existing.length} in window`,
      );
    }
    if (diff.toRemove.length > 0 || diff.toRestore.length > 0) {
      args.log(
        `[${args.accountEmail}] reconciled ${diff.toRemove.length} removed, ${diff.toRestore.length} restored`,
      );
    }

    debug.info("reconcile done", {
      account: args.accountEmail,
      windowSize: existing.length,
      removed: diff.toRemove.length,
      restored: diff.toRestore.length,
      capReached: args.capReached,
    });

    return {
      removed: diff.toRemove.length,
      restored: diff.toRestore.length,
      windowSize: existing.length,
    };
  });
