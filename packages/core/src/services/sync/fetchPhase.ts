import { Effect, Ref } from "effect";
import type { LabelRow } from "../labels";
import { AccountNotFoundError, LabelSyncError, MessageSearchError } from "./errors";
import type { GrantError } from "./steps";
import type { NormalizedMessage, RunTrigger } from "./types";
import type { SyncServerEventT } from "../../schemas/syncEvents";
import { resolveSyncRange, type DateRange } from "../../util/time";
import { GmailService } from "./services";
import type { LabelStore } from "../../stores/contracts";
import { createDebug } from "../../util/debug";
import {
  stepValidateAccount,
  stepOpenSyncWindow,
  stepSyncLabels,
  stepSyncFilters,
  stepSyncMessages,
  stepFetchMessages,
  stepUpsertAndLink,
} from "./steps";
import { stepReconcileRemovedMessages } from "./reconcile";

const debug = createDebug("service:sync:fetchPhase");

export interface FetchPhaseOptions {
  accountEmail: string;
  since?: string;
  range?: DateRange;
  max: number;
  log: (msg: string) => void;
  emit: (event: SyncServerEventT) => void;
  trigger?: RunTrigger;
}

export interface FetchPhaseResult {
  account: { id: string; email: string };
  syncWindowId: string;
  labelsByName: Map<string, LabelRow>;
  labelsByGmailId: Map<string, LabelRow>;
  normalized: NormalizedMessage[];
  filtersSynced: number;
  messagesFetchedRef: Ref.Ref<number>;
  messagesNewRef: Ref.Ref<number>;
  errorsRef: Ref.Ref<string[]>;
}

export const fetchPhase = (
  opts: FetchPhaseOptions,
): Effect.Effect<
  FetchPhaseResult,
  AccountNotFoundError | LabelSyncError | MessageSearchError | GrantError,
  GmailService | LabelStore
> =>
  Effect.gen(function* () {
    const account = yield* stepValidateAccount(opts.accountEmail);

    const syncWindowId = yield* stepOpenSyncWindow({
      accountId: account.id,
      since: opts.since,
      range: opts.range,
      trigger: opts.trigger,
    });

    const messagesFetchedRef = yield* Ref.make(0);
    const messagesNewRef = yield* Ref.make(0);
    const errorsRef = yield* Ref.make<string[]>([]);

    // Labels, filters and message search/dedup are independent — run together
    const [labelsByName, filtersSynced, { hits, existingIds }] = yield* Effect.all(
      [
        stepSyncLabels({
          accountId: account.id,
          accountEmail: account.email,
          log: opts.log,
        }),
        stepSyncFilters({
          accountId: account.id,
          accountEmail: account.email,
          log: opts.log,
          errorsRef,
        }),
        stepSyncMessages({
          accountId: account.id,
          accountEmail: account.email,
          since: opts.since,
          range: opts.range,
          max: opts.max,
          log: opts.log,
        }),
      ],
      { concurrency: "unbounded" },
    );

    const normalized = yield* stepFetchMessages({
      accountId: account.id,
      accountEmail: account.email,
      hits,
      existingIds,
      log: opts.log,
      errorsRef,
    });

    // When the search hits the cap, we can't distinguish real removals from
    // hits beyond the cap, so reconcile skips removal in that case.
    const resolved = resolveSyncRange({
      since: opts.since,
      range: opts.range,
    });
    yield* stepReconcileRemovedMessages({
      accountId: account.id,
      accountEmail: account.email,
      rangeFrom: resolved.from,
      rangeTo: resolved.to,
      hits: new Set(hits.map((h) => h.messageId)),
      capReached: hits.length >= opts.max,
      log: opts.log,
    });

    yield* Ref.set(messagesFetchedRef, hits.length);
    yield* Ref.set(messagesNewRef, normalized.length);

    if (normalized.length === 0) {
      debug("nothing fetched", { account: account.email });
      opts.emit({ type: "mails.fetched", account: account.email, count: 0 });
      return {
        account: { id: account.id, email: account.email },
        syncWindowId,
        labelsByName,
        labelsByGmailId: new Map<string, LabelRow>(),
        normalized,
        filtersSynced,
        messagesFetchedRef,
        messagesNewRef,
        errorsRef,
      };
    }

    const { labelsByGmailId } = yield* stepUpsertAndLink({
      accountId: account.id,
      accountEmail: account.email,
      normalized,
      log: opts.log,
      emit: opts.emit,
    });

    return {
      account: { id: account.id, email: account.email },
      syncWindowId,
      labelsByName,
      labelsByGmailId,
      normalized,
      filtersSynced,
      messagesFetchedRef,
      messagesNewRef,
      errorsRef,
    };
  });
