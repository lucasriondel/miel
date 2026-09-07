import { Effect, Ref } from "effect";
import type { LabelRow } from "../labels";
import { AccountNotFoundError, LabelSyncError, MessageSearchError } from "./errors";
import type { ProviderUnavailableError } from "../../errors";
import type { GrantError } from "./steps";
import type { NormalizedMessage, RunTrigger } from "./types";
import type { SyncServerEventT } from "../../schemas/syncEvents";
import { resolveSyncRange, type DateRange } from "../../util/time";
import { GmailService } from "./services";
import type { Claude } from "../../claude/Claude";
import type { LabelStore, PromoStore } from "../../stores/contracts";
import { extractPromosForMessagesEffect } from "../promoCodes";
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
  | AccountNotFoundError
  | LabelSyncError
  | MessageSearchError
  | GrantError
  | ProviderUnavailableError,
  GmailService | LabelStore | Claude | PromoStore
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

    // Promo extraction (#159): the mail the fetch just upserted, once, before
    // triage. The service owns the prefilter and the model call — this phase
    // only says which messages are new and where the errors go. There is no
    // event: it is a step inside fetch, and a new wire event would cost the
    // server/client compatibility dance the repo already carries once.
    //
    // It must run after the upsert, not beside it: a promo row is keyed to its
    // message, so the rows have nothing to hang off until the messages exist.
    const promos = yield* extractPromosForMessagesEffect({
      accountId: account.id,
      accountEmail: account.email,
      messages: normalized,
      log: opts.log,
    });
    yield* Ref.update(errorsRef, (e) => [...e, ...promos.errors]);

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
