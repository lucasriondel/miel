import { Effect } from "effect";
import type { LabelRow } from "../labels";
import { getTriageBatchSettingsEffect } from "../settings";
import type { ProviderUnavailableError } from "../../errors";
import type { NormalizedMessage } from "./types";
import type { SyncServerEventT } from "../../schemas/syncEvents";
import { chunk, runTriageBatches } from "./triage";
import type { Claude } from "../../claude/Claude";
import type { SettingsStore } from "../../stores/contracts";

export interface TriagePhaseOptions {
  accountId: string;
  accountEmail: string;
  normalized: NormalizedMessage[];
  labelsByGmailId: Map<string, LabelRow>;
  log: (msg: string) => void;
  emit: (event: SyncServerEventT) => void;
}

export interface TriagePhaseResult {
  triaged: number;
  failedBatches: number;
  errors: string[];
}

export const triagePhase = (
  opts: TriagePhaseOptions,
): Effect.Effect<TriagePhaseResult, ProviderUnavailableError, Claude | SettingsStore> =>
  Effect.gen(function* () {
    const { batchSize, batchConcurrency } = yield* getTriageBatchSettingsEffect().pipe(
      Effect.orDie,
    );

    const batches = chunk(opts.normalized, batchSize);
    opts.log(
      `[${opts.accountEmail}] running ${batches.length} triage batch(es) over ${opts.normalized.length} messages`,
    );

    const result = yield* runTriageBatches({
      accountId: opts.accountId,
      accountEmail: opts.accountEmail,
      batches,
      labelsByGmailId: opts.labelsByGmailId,
      batchConcurrency,
      log: opts.log,
      emit: opts.emit,
    });

    return {
      triaged: result.triaged,
      failedBatches: result.failedBatches,
      errors: result.errors,
    };
  });
