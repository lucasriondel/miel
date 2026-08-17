import { Effect, Either } from "effect";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../../db/client";
import { messageLabels, messages, triages } from "../../db/schema";
import { getAccountByEmailEffect } from "../accounts";
import { getLabelsForAccountEffect } from "../labels";
import { getTriageBatchSettingsEffect } from "../settings";
import { AccountNotFoundError } from "./errors";
import type { ProviderUnavailableError } from "../../errors";
import type { TriageUntriagedOptions, TriageUntriagedResult, NormalizedMessage } from "./types";
import { chunk, runTriageBatches } from "./triage";
import type { Claude } from "../../claude/Claude";
import type { LabelStore, SettingsStore } from "../../stores/contracts";
import { createDebug } from "../../util/debug";
import { stepOpenTriageRun, stepFinishTriageRun, triageRunStatusFor } from "./triageRun";

const debug = createDebug("service:sync:triageUntriaged");

export const triageUntriagedForAccountEffect = (
  opts: TriageUntriagedOptions,
): Effect.Effect<
  TriageUntriagedResult,
  AccountNotFoundError | ProviderUnavailableError,
  Claude | SettingsStore | LabelStore
> =>
  Effect.gen(function* () {
    const log = opts.log ?? (() => {});
    const emit = opts.onEvent ?? (() => {});

    const account = yield* getAccountByEmailEffect(opts.accountEmail).pipe(
      Effect.flatMap((a) =>
        a ? Effect.succeed(a) : Effect.fail(new AccountNotFoundError({ email: opts.accountEmail })),
      ),
    );

    const { db } = getDb();

    const allLabels = yield* getLabelsForAccountEffect(account.id);
    const labelsByName = new Map(allLabels.map((l) => [l.name, l]));
    const existingLabelNames = allLabels.filter((l) => l.type === "user").map((l) => l.name);

    // Untriaged = no row in `triages` for that (account, gmailMessageId)
    const rows = yield* Effect.promise(() =>
      db
        .select({
          gmailMessageId: messages.gmailMessageId,
          gmailThreadId: messages.gmailThreadId,
          fromEmail: messages.fromEmail,
          fromName: messages.fromName,
          toEmails: messages.toEmails,
          subject: messages.subject,
          snippet: messages.snippet,
          bodyText: messages.bodyText,
          bodyHtml: messages.bodyHtml,
          internalDate: messages.internalDate,
          rawHeaders: messages.rawHeaders,
        })
        .from(messages)
        .leftJoin(
          triages,
          and(
            eq(triages.accountId, messages.accountId),
            eq(triages.gmailMessageId, messages.gmailMessageId),
          ),
        )
        .where(
          and(
            eq(messages.accountId, account.id),
            eq(messages.isArchived, false),
            eq(messages.isTrashed, false),
            isNull(messages.removedAt),
            isNull(triages.id),
          ),
        ),
    );

    log(`[${account.email}] ${rows.length} untriaged message(s) to triage`);
    debug.info("triageUntriagedForAccount candidates", {
      account: account.email,
      count: rows.length,
    });

    if (rows.length === 0) {
      emit({
        type: "triage.started",
        account: account.email,
        totalBatches: 0,
      });
      emit({
        type: "triage.finished",
        account: account.email,
        triaged: 0,
        suggestedNewLabels: 0,
        elapsedMs: 0,
        failedBatches: 0,
      });
      return {
        account: account.email,
        candidates: 0,
        triaged: 0,
        suggestedNewLabels: 0,
        errors: [],
      };
    }

    const gmailMessageIds = rows.map((r) => r.gmailMessageId);
    const labelLinks = yield* Effect.promise(() =>
      db
        .select({
          gmailMessageId: messageLabels.gmailMessageId,
          labelId: messageLabels.labelId,
        })
        .from(messageLabels)
        .where(
          and(
            eq(messageLabels.accountId, account.id),
            inArray(messageLabels.gmailMessageId, gmailMessageIds),
          ),
        ),
    );

    const labelById = new Map(allLabels.map((l) => [l.id, l]));
    const labelsByMsg = new Map<string, string[]>();
    for (const link of labelLinks) {
      const label = labelById.get(link.labelId);
      if (!label) continue;
      const list = labelsByMsg.get(link.gmailMessageId) ?? [];
      list.push(label.gmailLabelId);
      labelsByMsg.set(link.gmailMessageId, list);
    }
    const labelsByGmailId = new Map(allLabels.map((l) => [l.gmailLabelId, l]));

    const normalized: NormalizedMessage[] = rows.map((r) => ({
      accountId: account.id,
      gmailMessageId: r.gmailMessageId,
      gmailThreadId: r.gmailThreadId,
      fromEmail: r.fromEmail,
      fromName: r.fromName,
      toEmails: r.toEmails,
      subject: r.subject,
      snippet: r.snippet,
      bodyText: r.bodyText ?? "",
      bodyHtml: r.bodyHtml ?? "",
      internalDate: r.internalDate,
      rawHeaders: r.rawHeaders ?? {},
      labelIds: labelsByMsg.get(r.gmailMessageId) ?? [],
      attachments: [],
    }));

    const { batchSize, batchConcurrency } = yield* getTriageBatchSettingsEffect().pipe(
      Effect.orDie,
    );
    const batches = chunk(normalized, batchSize);

    const triageRunId = yield* stepOpenTriageRun({
      accountId: account.id,
      syncWindowId: null,
      trigger: opts.trigger,
      candidates: normalized.length,
    });

    const either = yield* runTriageBatches({
      accountId: account.id,
      accountEmail: account.email,
      batches,
      labelsByGmailId,
      labelsByName,
      existingLabelNames,
      batchConcurrency,
      log,
      emit,
    }).pipe(Effect.either);

    if (Either.isLeft(either)) {
      const err = either.left;
      const message = err instanceof Error ? err.message : String(err);
      yield* stepFinishTriageRun({
        triageRunId,
        status: "failed",
        triaged: 0,
        suggestedNewLabels: 0,
        failedBatches: 0,
        errors: [message],
      });
      return yield* Effect.fail(err);
    }

    const result = either.right;
    yield* stepFinishTriageRun({
      triageRunId,
      status: triageRunStatusFor(result),
      triaged: result.triaged,
      suggestedNewLabels: result.suggestedNewLabels,
      failedBatches: result.failedBatches,
      errors: result.errors,
    });

    return {
      account: account.email,
      candidates: normalized.length,
      triaged: result.triaged,
      suggestedNewLabels: result.suggestedNewLabels,
      errors: result.errors,
    };
  });
