import { Effect, Either, Ref } from "effect";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { accounts } from "../../db/schema";
import { AccountNotFoundError, LabelSyncError, MessageSearchError } from "./errors";
import type { ProviderUnavailableError } from "../../errors";
import type { GrantError } from "./steps";
import type { FetchAndTriageOptions, SyncRunResult } from "./types";
import { fetchPhase, type FetchPhaseResult } from "./fetchPhase";
import { triagePhase } from "./triagePhase";
import { GmailService } from "./services";
import type { Claude } from "../../claude/Claude";
import type { LabelStore, SettingsStore } from "../../stores/contracts";
import { createDebug } from "../../util/debug";
import { stepMarkCompleted } from "./steps";
import { stepOpenTriageRun, stepFinishTriageRun, triageRunStatusFor } from "./triageRun";

const debug = createDebug("service:sync:fetchAndTriage");
const DEFAULT_SEARCH_MAX = 200;

const finalizeSync = (fetch: FetchPhaseResult): Effect.Effect<string[]> =>
  Effect.gen(function* () {
    const { db } = getDb();
    yield* Effect.promise(() =>
      db
        .update(accounts)
        .set({ lastSyncedAt: new Date() })
        .where(eq(accounts.id, fetch.account.id)),
    );
    yield* stepMarkCompleted({
      syncWindowId: fetch.syncWindowId,
      accountId: fetch.account.id,
      messagesFetched: fetch.messagesFetchedRef,
      messagesNew: fetch.messagesNewRef,
      errorsRef: fetch.errorsRef,
    });
    return yield* Ref.get(fetch.errorsRef);
  });

export const fetchAndTriageEffect = (
  opts: FetchAndTriageOptions,
): Effect.Effect<
  SyncRunResult,
  | AccountNotFoundError
  | LabelSyncError
  | MessageSearchError
  | GrantError
  | ProviderUnavailableError,
  GmailService | Claude | SettingsStore | LabelStore
> => {
  const log = opts.log ?? (() => {});
  const emit = opts.onEvent ?? (() => {});
  const max = opts.max ?? DEFAULT_SEARCH_MAX;

  return Effect.gen(function* () {
    debug.info("fetchAndTriage start", {
      accountEmail: opts.accountEmail,
      since: opts.since,
      range: opts.range,
      max,
    });

    const fetch = yield* fetchPhase({
      accountEmail: opts.accountEmail,
      since: opts.since,
      range: opts.range,
      max,
      log,
      emit,
      trigger: opts.trigger,
    });

    // Nothing to triage, or fetch-only mode
    if (fetch.normalized.length === 0 || opts.triage === false) {
      if (fetch.normalized.length === 0) {
        debug.info("nothing to triage", { account: fetch.account.email });
      }
      const errors = yield* finalizeSync(fetch);
      return {
        account: fetch.account.email,
        fetched: fetch.normalized.length,
        triaged: 0,
        suggestedNewLabels: 0,
        filtersSynced: fetch.filtersSynced,
        suggestedFilters: 0,
        errors,
      };
    }

    const triageRunId = yield* stepOpenTriageRun({
      accountId: fetch.account.id,
      syncWindowId: fetch.syncWindowId,
      trigger: opts.trigger,
      candidates: fetch.normalized.length,
    });

    const triageEither = yield* triagePhase({
      accountId: fetch.account.id,
      accountEmail: fetch.account.email,
      normalized: fetch.normalized,
      labelsByGmailId: fetch.labelsByGmailId,
      labelsByName: fetch.labelsByName,
      log,
      emit,
    }).pipe(Effect.either);

    if (Either.isLeft(triageEither)) {
      const err = triageEither.left;
      const message = err instanceof Error ? err.message : String(err);
      yield* stepFinishTriageRun({
        triageRunId,
        status: "failed",
        triaged: 0,
        suggestedNewLabels: 0,
        failedBatches: 0,
        errors: [message],
      });
      yield* Ref.update(fetch.errorsRef, (e) => [...e, message]);
      yield* finalizeSync(fetch);
      return yield* Effect.fail(err);
    }

    const triage = triageEither.right;
    yield* stepFinishTriageRun({
      triageRunId,
      status: triageRunStatusFor(triage),
      triaged: triage.triaged,
      suggestedNewLabels: triage.suggestedNewLabels,
      failedBatches: triage.failedBatches,
      errors: triage.errors,
    });

    yield* Ref.update(fetch.errorsRef, (e) => [...e, ...triage.errors]);
    const errors = yield* finalizeSync(fetch);

    return {
      account: fetch.account.email,
      fetched: fetch.normalized.length,
      triaged: triage.triaged,
      suggestedNewLabels: triage.suggestedNewLabels,
      filtersSynced: fetch.filtersSynced,
      suggestedFilters: triage.suggestedFilters,
      errors,
    };
  });
};
