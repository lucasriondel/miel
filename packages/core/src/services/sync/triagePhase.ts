import { Effect } from "effect";
import { getLabelsForAccountEffect, type LabelRow } from "../labels";
import { getTriageBatchSettingsEffect } from "../settings";
import type { ProviderUnavailableError } from "../../errors";
import type { NormalizedMessage } from "./types";
import type { SyncServerEventT } from "../../schemas/syncEvents";
import { chunk, runTriageBatches } from "./triage";
import { runFilterSuggest } from "./filters";
import type { Claude } from "../../claude/Claude";
import type { LabelStore, SettingsStore } from "../../stores/contracts";

export interface TriagePhaseOptions {
  accountId: string;
  accountEmail: string;
  normalized: NormalizedMessage[];
  labelsByGmailId: Map<string, LabelRow>;
  labelsByName: Map<string, LabelRow>;
  log: (msg: string) => void;
  emit: (event: SyncServerEventT) => void;
}

export interface TriagePhaseResult {
  triaged: number;
  suggestedNewLabels: number;
  suggestedFilters: number;
  failedBatches: number;
  errors: string[];
}

export const triagePhase = (
  opts: TriagePhaseOptions,
): Effect.Effect<
  TriagePhaseResult,
  ProviderUnavailableError,
  Claude | SettingsStore | LabelStore
> =>
  Effect.gen(function* () {
    const allLabels = yield* getLabelsForAccountEffect(opts.accountId);
    const existingLabelNames = allLabels.filter((l) => l.type === "user").map((l) => l.name);
    const { batchSize, batchConcurrency } = yield* getTriageBatchSettingsEffect().pipe(
      Effect.orDie,
    );

    const batches = chunk(opts.normalized, batchSize);
    opts.log(
      `[${opts.accountEmail}] running ${batches.length} triage batch(es) over ${opts.normalized.length} messages`,
    );

    const [triageResult, filterResult] = yield* Effect.all(
      [
        runTriageBatches({
          accountId: opts.accountId,
          accountEmail: opts.accountEmail,
          batches,
          labelsByGmailId: opts.labelsByGmailId,
          labelsByName: opts.labelsByName,
          existingLabelNames,
          batchConcurrency,
          log: opts.log,
          emit: opts.emit,
        }),
        runFilterSuggest({
          accountId: opts.accountId,
          accountEmail: opts.accountEmail,
          normalized: opts.normalized,
          labelsByGmailId: opts.labelsByGmailId,
          emit: opts.emit,
          log: opts.log,
        }),
      ],
      { concurrency: "unbounded" },
    );

    opts.emit({
      type: "filters.finished",
      account: opts.accountEmail,
      suggestedFilters: filterResult.suggestedFilters,
    });

    return {
      triaged: triageResult.triaged,
      suggestedNewLabels: triageResult.suggestedNewLabels,
      suggestedFilters: filterResult.suggestedFilters,
      failedBatches: triageResult.failedBatches,
      errors: [...triageResult.errors, ...filterResult.errors],
    };
  });
