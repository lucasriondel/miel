import { Effect, Either, Ref } from "effect";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { syncWindows } from "../../db/schema";
import { getAccountByEmailEffect } from "../accounts";
import {
  getLabelsForAccountEffect,
  getLabelsByGmailIdsEffect,
  syncLabelsForAccountEffect,
  type LabelRow,
} from "../labels";
import { syncFiltersForAccountEffect } from "../filters";
import { AccountNotFoundError, LabelSyncError, MessageSearchError } from "./errors";
import { AccountNotConnectedError, GmailAuthError, TokenRefreshError } from "../../errors";
import type { NormalizedMessage } from "./types";
import { normalizeMessage } from "./normalize";
import { deduplicateHits, upsertMessageLabels, upsertMessages } from "./messages";
import { GmailService } from "./services";
import type { LabelStore } from "../../stores/contracts";
import { resolveSyncRange } from "../../util/time";
import { createDebug } from "../../util/debug";
import { tryAsync } from "../../util/effect";

const debug = createDebug("service:sync:steps");

/** A missing/revoked Google grant — must reach syncAll for the reconnect flow. */
export type GrantError = TokenRefreshError | GmailAuthError | AccountNotConnectedError;

const GRANT_TAGS = new Set(["TokenRefreshError", "GmailAuthError", "AccountNotConnectedError"]);

function isGrantError(err: unknown): err is GrantError {
  const tag = (err as { _tag?: string })?._tag;
  return tag !== undefined && GRANT_TAGS.has(tag);
}

export const stepValidateAccount = (
  accountEmail: string,
): Effect.Effect<{ id: string; email: string }, AccountNotFoundError> =>
  Effect.gen(function* () {
    const account = yield* getAccountByEmailEffect(accountEmail);
    if (!account) {
      return yield* Effect.fail(new AccountNotFoundError({ email: accountEmail }));
    }
    return account;
  });

export const stepOpenSyncWindow = (args: {
  accountId: string;
  since?: string;
  range?: any;
  trigger?: "manual" | "automatic";
}): Effect.Effect<string> =>
  Effect.gen(function* () {
    const { db } = getDb();
    const resolved = resolveSyncRange({
      since: args.since,
      range: args.range,
    });
    const [{ id: syncWindowId }] = yield* Effect.promise(() =>
      db
        .insert(syncWindows)
        .values({
          accountId: args.accountId,
          rangeFrom: resolved.from,
          rangeTo: resolved.to,
          query: resolved.query,
          trigger: args.trigger ?? "manual",
        })
        .returning({ id: syncWindows.id }),
    );
    debug.info("sync window opened", {
      id: syncWindowId,
      from: resolved.from.toISOString(),
      to: resolved.to.toISOString(),
    });
    return syncWindowId;
  });

export const stepSyncLabels = (args: {
  accountId: string;
  accountEmail: string;
  log: (msg: string) => void;
}): Effect.Effect<Map<string, LabelRow>, LabelSyncError | GrantError, GmailService | LabelStore> =>
  Effect.gen(function* () {
    const gmail = yield* GmailService;
    args.log(`[${args.accountEmail}] syncing labels`);
    debug.info("syncing labels", { account: args.accountEmail });

    yield* syncLabelsForAccountEffect({
      accountId: args.accountId,
      accountEmail: args.accountEmail,
      gmail,
    }).pipe(
      Effect.catchAll((err): Effect.Effect<never, LabelSyncError | GrantError> =>
        // A missing/revoked Google grant must surface unwrapped so syncAll can
        // drive the reconnect flow.
        isGrantError(err)
          ? Effect.fail(err as GrantError)
          : Effect.fail(
              new LabelSyncError({
                accountEmail: args.accountEmail,
                cause: err,
              }),
            ),
      ),
    );

    const allLabels = yield* getLabelsForAccountEffect(args.accountId);
    const labelsByName = new Map(allLabels.map((l) => [l.name, l]));
    debug.info("labels loaded", {
      account: args.accountEmail,
      count: allLabels.length,
    });
    return labelsByName;
  });

export const stepSyncFilters = (args: {
  accountId: string;
  accountEmail: string;
  log: (msg: string) => void;
  errorsRef: Ref.Ref<string[]>;
}): Effect.Effect<number, never, GmailService> =>
  Effect.gen(function* () {
    const gmail = yield* GmailService;
    args.log(`[${args.accountEmail}] syncing filters`);

    const syncFiltersResult = yield* syncFiltersForAccountEffect({
      accountId: args.accountId,
      accountEmail: args.accountEmail,
      gmail,
    }).pipe(Effect.either);

    if (Either.isRight(syncFiltersResult)) {
      const syncedFilters = syncFiltersResult.right;
      args.log(`[${args.accountEmail}] ${syncedFilters.length} filter(s)`);
      return syncedFilters.length;
    } else {
      const m = (syncFiltersResult.left as Error).message;
      yield* Ref.update(args.errorsRef, (e) => [...e, `syncFilters: ${m}`]);
      args.log(`[${args.accountEmail}] WARN syncFilters failed: ${m}`);
      return 0;
    }
  });

export const stepSearchMessages = (args: {
  accountEmail: string;
  since?: string;
  range?: any;
  max: number;
  log: (msg: string) => void;
}): Effect.Effect<
  Array<{ messageId: string; threadId: string }>,
  MessageSearchError | GrantError,
  GmailService
> =>
  Effect.gen(function* () {
    const gmail = yield* GmailService;
    const resolved = resolveSyncRange({
      since: args.since,
      range: args.range,
    });
    const { query } = resolved;

    args.log(`[${args.accountEmail}] searching messages (${query}, max=${args.max})`);

    const hits = yield* tryAsync(() =>
      gmail.searchMessages({
        account: args.accountEmail,
        query,
        max: args.max,
      }),
    ).pipe(
      Effect.catchAll((err): Effect.Effect<never, MessageSearchError | GrantError> =>
        // Reauth must surface unwrapped so syncAll can drive the reauth flow.
        isGrantError(err)
          ? Effect.fail(err as GrantError)
          : Effect.fail(
              new MessageSearchError({
                accountEmail: args.accountEmail,
                cause: err,
              }),
            ),
      ),
    );

    args.log(`[${args.accountEmail}] ${hits.length} hits`);
    debug.info("search hits", { account: args.accountEmail, hits: hits.length });
    return hits;
  });

export const stepSyncMessages = (args: {
  accountId: string;
  accountEmail: string;
  since?: string;
  range?: any;
  max: number;
  log: (msg: string) => void;
}): Effect.Effect<
  {
    hits: Array<{ messageId: string; threadId: string }>;
    existingIds: Set<string>;
  },
  MessageSearchError | GrantError,
  GmailService
> =>
  Effect.gen(function* () {
    const hits = yield* stepSearchMessages({
      accountEmail: args.accountEmail,
      since: args.since,
      range: args.range,
      max: args.max,
      log: args.log,
    });
    const existingIds = yield* deduplicateHits({
      accountId: args.accountId,
      hitIds: hits.map((h) => h.messageId),
    });
    return { hits, existingIds };
  });

export const stepFetchMessages = (args: {
  accountId: string;
  accountEmail: string;
  hits: Array<{ messageId: string }>;
  existingIds: Set<string>;
  log: (msg: string) => void;
  errorsRef: Ref.Ref<string[]>;
}): Effect.Effect<NormalizedMessage[], never, GmailService> =>
  Effect.gen(function* () {
    const gmail = yield* GmailService;
    const newHits = args.hits.filter((h) => !args.existingIds.has(h.messageId));

    args.log(
      `[${args.accountEmail}] ${newHits.length} new (skipping ${args.existingIds.size} already in db)`,
    );
    debug.info("new hits after dedupe", {
      account: args.accountEmail,
      newHits: newHits.length,
      skipped: args.existingIds.size,
    });

    // Fetch each message, accumulate errors for non-fatal fetch failures
    const fetchResults = yield* Effect.all(
      newHits.map((hit) =>
        tryAsync(() =>
          gmail.getMessage({
            account: args.accountEmail,
            messageId: hit.messageId,
          }),
        ).pipe(
          Effect.map((raw) => normalizeMessage(args.accountId, raw)),
          Effect.either,
        ),
      ),
      { concurrency: "unbounded" },
    );

    const normalized: NormalizedMessage[] = [];
    let trashedSkipped = 0;
    for (let i = 0; i < fetchResults.length; i++) {
      const result = fetchResults[i];
      if (Either.isLeft(result)) {
        const m = (result.left as Error).message;
        yield* Ref.update(args.errorsRef, (e) => [
          ...e,
          `getMessage(${newHits[i].messageId}): ${m}`,
        ]);
        args.log(`[${args.accountEmail}] WARN getMessage failed for ${newHits[i].messageId}: ${m}`);
        debug.warn("getMessage failed", {
          account: args.accountEmail,
          messageId: newHits[i].messageId,
          error: m,
        });
      } else if (result.right.labelIds.includes("TRASH")) {
        // Gmail search runs with `-in:trash`, but a message can be trashed in
        // the window between search and getMessage. Drop trashed mail here so
        // it never reaches upsert / triage.
        trashedSkipped += 1;
        debug("skipping trashed message", {
          account: args.accountEmail,
          messageId: newHits[i].messageId,
        });
      } else {
        normalized.push(result.right);
      }
    }

    if (trashedSkipped > 0) {
      args.log(`[${args.accountEmail}] skipped ${trashedSkipped} trashed message(s)`);
    }

    debug.info("normalized messages", {
      account: args.accountEmail,
      count: normalized.length,
    });
    return normalized;
  });

export const stepUpsertAndLink = (args: {
  accountId: string;
  accountEmail: string;
  normalized: NormalizedMessage[];
  log: (msg: string) => void;
  emit: (e: any) => void;
}): Effect.Effect<
  {
    messagesFetched: number;
    messagesNew: number;
    labelsByGmailId: Map<string, LabelRow>;
  },
  never,
  LabelStore
> =>
  Effect.gen(function* () {
    const messagesFetched = args.normalized.length;
    const messagesNew = args.normalized.length;

    yield* upsertMessages(args.normalized);
    debug.info("upserted messages", {
      count: args.normalized.length,
    });

    args.emit({
      type: "mails.fetched",
      account: args.accountEmail,
      count: args.normalized.length,
    });

    const allGmailLabelIds = Array.from(new Set(args.normalized.flatMap((m) => m.labelIds)));
    const matchedLabels = yield* getLabelsByGmailIdsEffect({
      accountId: args.accountId,
      gmailLabelIds: allGmailLabelIds,
    });
    const labelsByGmailId = new Map(matchedLabels.map((l) => [l.gmailLabelId, l]));

    yield* upsertMessageLabels({
      accountId: args.accountId,
      rows: args.normalized.map((r) => ({
        gmailMessageId: r.gmailMessageId,
        labelIds: r.labelIds,
      })),
      labelMap: new Map(matchedLabels.map((l) => [l.gmailLabelId, l.id])),
    });

    debug.info("upserted message_labels", {
      distinctGmailLabels: allGmailLabelIds.length,
      matchedLabels: matchedLabels.length,
    });

    return { messagesFetched, messagesNew, labelsByGmailId };
  });

export const stepMarkCompleted = (args: {
  syncWindowId: string;
  accountId: string;
  messagesFetched: Ref.Ref<number>;
  messagesNew: Ref.Ref<number>;
  errorsRef: Ref.Ref<string[]>;
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    const { db } = getDb();
    const fetched = yield* Ref.get(args.messagesFetched);
    const newMsgs = yield* Ref.get(args.messagesNew);
    const errors = yield* Ref.get(args.errorsRef);

    yield* Effect.promise(() =>
      db
        .update(syncWindows)
        .set({
          status: "completed",
          messagesFetched: fetched,
          messagesNew: newMsgs,
          error: errors.length > 0 ? errors.join("\n") : null,
          finishedAt: new Date(),
        })
        .where(eq(syncWindows.id, args.syncWindowId)),
    );
  });
