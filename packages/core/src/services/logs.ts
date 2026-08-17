import { Effect } from "effect";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { accounts, syncWindows, triageRuns } from "../db/schema";
import { runPromiseRethrow } from "../util/effect";
import type { RunTrigger } from "./sync/types";

export const STALE_RUN_ERROR_MESSAGE = "process restarted before completion";

export interface LogEntryBase {
  id: string;
  type: "sync" | "triage";
  accountId: string;
  accountEmail: string | null;
  trigger: RunTrigger;
  status: "running" | "completed" | "failed";
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
}

export interface SyncLogEntry extends LogEntryBase {
  type: "sync";
  messagesFetched: number;
  messagesNew: number;
  rangeFrom: Date;
  rangeTo: Date;
}

export interface TriageLogEntry extends LogEntryBase {
  type: "triage";
  candidates: number;
  triaged: number;
  suggestedNewLabels: number;
  failedBatches: number;
  syncWindowId: string | null;
}

export type LogEntry = SyncLogEntry | TriageLogEntry;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export const listRunsEffect = (args: { limit?: number } = {}): Effect.Effect<LogEntry[]> =>
  Effect.gen(function* () {
    const { db } = getDb();
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const syncRows = yield* Effect.promise(() =>
      db
        .select({
          id: syncWindows.id,
          accountId: syncWindows.accountId,
          accountEmail: accounts.email,
          trigger: syncWindows.trigger,
          status: syncWindows.status,
          startedAt: syncWindows.startedAt,
          finishedAt: syncWindows.finishedAt,
          error: syncWindows.error,
          messagesFetched: syncWindows.messagesFetched,
          messagesNew: syncWindows.messagesNew,
          rangeFrom: syncWindows.rangeFrom,
          rangeTo: syncWindows.rangeTo,
        })
        .from(syncWindows)
        .leftJoin(accounts, eq(accounts.id, syncWindows.accountId))
        .orderBy(desc(syncWindows.startedAt))
        .limit(limit),
    );

    const triageRows = yield* Effect.promise(() =>
      db
        .select({
          id: triageRuns.id,
          accountId: triageRuns.accountId,
          accountEmail: accounts.email,
          trigger: triageRuns.trigger,
          status: triageRuns.status,
          startedAt: triageRuns.startedAt,
          finishedAt: triageRuns.finishedAt,
          error: triageRuns.error,
          candidates: triageRuns.candidates,
          triaged: triageRuns.triaged,
          suggestedNewLabels: triageRuns.suggestedNewLabels,
          failedBatches: triageRuns.failedBatches,
          syncWindowId: triageRuns.syncWindowId,
        })
        .from(triageRuns)
        .leftJoin(accounts, eq(accounts.id, triageRuns.accountId))
        .orderBy(desc(triageRuns.startedAt))
        .limit(limit),
    );

    const merged: LogEntry[] = [
      ...syncRows.map((r): SyncLogEntry => ({ type: "sync", ...r })),
      ...triageRows.map((r): TriageLogEntry => ({ type: "triage", ...r })),
    ];
    merged.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return merged.slice(0, limit);
  });

export async function listRuns(args: { limit?: number } = {}) {
  return runPromiseRethrow(listRunsEffect(args));
}

export interface MarkStaleRunsFailedResult {
  syncWindows: number;
  triageRuns: number;
}

// Any sync/triage row still marked "running" when this function runs was
// orphaned by a crash/restart — the process that owned it is gone and it will
// never finish. Flip them to "failed" so the Logs UI stops showing dead work
// as active.
export const markStaleRunsFailedEffect = (): Effect.Effect<MarkStaleRunsFailedResult> =>
  Effect.gen(function* () {
    const { db } = getDb();
    const now = new Date();

    const staleSync = yield* Effect.promise(() =>
      db
        .update(syncWindows)
        .set({ status: "failed", error: STALE_RUN_ERROR_MESSAGE, finishedAt: now })
        .where(eq(syncWindows.status, "running"))
        .returning({ id: syncWindows.id }),
    );

    const staleTriage = yield* Effect.promise(() =>
      db
        .update(triageRuns)
        .set({ status: "failed", error: STALE_RUN_ERROR_MESSAGE, finishedAt: now })
        .where(eq(triageRuns.status, "running"))
        .returning({ id: triageRuns.id }),
    );

    return { syncWindows: staleSync.length, triageRuns: staleTriage.length };
  });

export async function markStaleRunsFailed() {
  return runPromiseRethrow(markStaleRunsFailedEffect());
}
