import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { triageRuns } from "../../db/schema";
import type { RunTrigger } from "./types";

export type TriageRunStatus = "completed" | "failed";

// A run that produced zero triaged messages despite some batches failing is
// considered failed; anything else is completed (partial failure is still a
// real result).
export function triageRunStatusFor(result: {
  triaged: number;
  failedBatches: number;
}): TriageRunStatus {
  return result.failedBatches > 0 && result.triaged === 0 ? "failed" : "completed";
}

export const stepOpenTriageRun = (args: {
  accountId: string;
  syncWindowId?: string | null;
  trigger?: RunTrigger;
  candidates: number;
}): Effect.Effect<string> =>
  Effect.gen(function* () {
    const { db } = getDb();
    const [{ id }] = yield* Effect.promise(() =>
      db
        .insert(triageRuns)
        .values({
          accountId: args.accountId,
          syncWindowId: args.syncWindowId ?? null,
          trigger: args.trigger ?? "manual",
          candidates: args.candidates,
        })
        .returning({ id: triageRuns.id }),
    );
    return id;
  });

export const stepFinishTriageRun = (args: {
  triageRunId: string;
  status: TriageRunStatus;
  triaged: number;
  suggestedNewLabels: number;
  failedBatches: number;
  errors: string[];
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    const { db } = getDb();
    yield* Effect.promise(() =>
      db
        .update(triageRuns)
        .set({
          status: args.status,
          triaged: args.triaged,
          suggestedNewLabels: args.suggestedNewLabels,
          failedBatches: args.failedBatches,
          error: args.errors.length > 0 ? args.errors.join("\n") : null,
          finishedAt: new Date(),
        })
        .where(eq(triageRuns.id, args.triageRunId)),
    );
  });
