import { Effect, Ref } from "effect";
import { getDb } from "../../db/client";
import { suggestedLabels, triages, triageLabelSuggestions } from "../../db/schema";
import { type TriageInputItemT, type TriageOutputItemT, TriageInput } from "../../schemas/triage";
import type { SyncServerEventT } from "../../schemas/syncEvents";
import type { NormalizedMessage } from "./types";
import type { LabelRow } from "../labels";
import { Claude } from "../../claude/Claude";
import type { ProviderUnavailableError } from "../../errors";
import { recoverUnlessProviderUnavailable } from "./providerFailure";
import { createDebug } from "../../util/debug";

const debug = createDebug("service:sync:triage");

export function buildTriageItems(
  rows: NormalizedMessage[],
  labelsByGmailId: Map<string, LabelRow>,
): TriageInputItemT[] {
  return rows.map((r) => ({
    id: r.gmailMessageId,
    from: r.fromEmail,
    subject: r.subject,
    snippet: r.snippet,
    currentLabels: r.labelIds
      .map((id) => labelsByGmailId.get(id)?.name)
      .filter((n): n is string => Boolean(n)),
  }));
}

export const persistTriageResults = (args: {
  accountId: string;
  model: string;
  runId: string;
  byMessageId: Map<string, NormalizedMessage>;
  labelsByName: Map<string, LabelRow>;
  items: TriageOutputItemT[];
}): Effect.Effect<{ persisted: number; newLabelSuggestions: number }> =>
  Effect.gen(function* () {
    const { db } = getDb();
    let persisted = 0;
    let newLabelSuggestions = 0;

    for (const item of args.items) {
      const msg = args.byMessageId.get(item.id);
      if (!msg) continue;

      const inserted = yield* Effect.promise(() =>
        db
          .insert(triages)
          .values({
            accountId: args.accountId,
            gmailMessageId: msg.gmailMessageId,
            priority: item.priority,
            reasoning: item.reasoning,
            claudeRunId: args.runId,
            model: args.model,
          })
          .returning({ id: triages.id }),
      );
      const triageId = inserted[0].id;
      persisted += 1;

      const labelSuggestionRows: { triageId: string; labelId: string }[] = [];
      for (const name of item.applyExistingLabels) {
        const label = args.labelsByName.get(name);
        if (!label) continue;
        labelSuggestionRows.push({ triageId, labelId: label.id });
      }
      if (labelSuggestionRows.length > 0) {
        yield* Effect.promise(() =>
          db.insert(triageLabelSuggestions).values(labelSuggestionRows).onConflictDoNothing(),
        );
      }

      if (item.suggestNewLabels.length > 0) {
        yield* Effect.promise(() =>
          db.insert(suggestedLabels).values(
            item.suggestNewLabels.map((s) => ({
              triageId,
              name: s.name,
              reasoning: s.reasoning,
            })),
          ),
        );
        newLabelSuggestions += item.suggestNewLabels.length;
      }
    }
    return { persisted, newLabelSuggestions };
  });

interface RunTriageBatchesArgs {
  accountId: string;
  accountEmail: string;
  batches: NormalizedMessage[][];
  labelsByGmailId: Map<string, LabelRow>;
  labelsByName: Map<string, LabelRow>;
  existingLabelNames: string[];
  // Cap parallel Claude calls so the UI progress counter advances in waves
  // instead of jumping from 0 to N when every batch finishes at once.
  batchConcurrency: number;
  log: (msg: string) => void;
  emit: (event: SyncServerEventT) => void;
}

interface RunTriageBatchesResult {
  triaged: number;
  suggestedNewLabels: number;
  failedBatches: number;
  errors: string[];
}

export const runTriageBatches = (
  args: RunTriageBatchesArgs,
): Effect.Effect<RunTriageBatchesResult, ProviderUnavailableError, Claude> =>
  Effect.gen(function* () {
    const {
      accountId,
      accountEmail,
      batches,
      labelsByGmailId,
      labelsByName,
      existingLabelNames,
      batchConcurrency,
      log,
      emit,
    } = args;

    const triageStartMs = Date.now();
    emit({
      type: "triage.started",
      account: accountEmail,
      totalBatches: batches.length,
    });

    const errorsRef = yield* Ref.make<string[]>([]);

    const runOneBatch = (batch: NormalizedMessage[], batchIndex: number) =>
      Effect.gen(function* () {
        const items = buildTriageItems(batch, labelsByGmailId);
        const input = TriageInput.parse({
          account: accountEmail,
          accountId,
          existingLabels: existingLabelNames,
          messages: items,
        });
        emit({
          type: "triage.batch.progress",
          account: accountEmail,
          batchIndex,
          totalBatches: batches.length,
          status: "started",
        });

        const claude = yield* Claude;
        log(`[${accountEmail}] batch ${batchIndex + 1}/${batches.length} → claude`);
        debug.info("triage batch start", {
          account: accountEmail,
          batch: batchIndex + 1,
          of: batches.length,
          items: items.length,
        });

        const { output, runId, model } = yield* claude.run("triage", input);

        debug.info("triage batch returned", {
          account: accountEmail,
          batch: batchIndex + 1,
          results: output.results.length,
          runId,
          model,
        });

        const byId = new Map(batch.map((m) => [m.gmailMessageId, m]));
        const returnedIds = new Set(output.results.map((r) => r.id));
        const missing = items.filter((m) => !returnedIds.has(m.id));

        if (missing.length > 0) {
          const m = `triage batch ${batchIndex + 1} dropped ids: ${missing.map((x) => x.id).join(",")}`;
          yield* Ref.update(errorsRef, (e) => [...e, m]);
          log(`[${accountEmail}] WARN ${m}`);
        }

        const extras = output.results.filter((r) => !byId.has(r.id));
        if (extras.length > 0) {
          const m = `triage batch ${batchIndex + 1} returned unknown ids: ${extras.map((x) => x.id).join(",")}`;
          yield* Ref.update(errorsRef, (e) => [...e, m]);
          log(`[${accountEmail}] WARN ${m}`);
        }

        const persisted = yield* persistTriageResults({
          accountId,
          model,
          runId,
          byMessageId: byId,
          labelsByName,
          items: output.results.filter((r) => byId.has(r.id)),
        });

        debug.info("triage batch persisted", {
          account: accountEmail,
          batch: batchIndex + 1,
          persisted: persisted.persisted,
          newLabelSuggestions: persisted.newLabelSuggestions,
        });

        emit({
          type: "triage.batch.progress",
          account: accountEmail,
          batchIndex,
          totalBatches: batches.length,
          status: "done",
        });

        return {
          persisted: persisted.persisted,
          newLabelSuggestions: persisted.newLabelSuggestions,
        };
      }).pipe(
        // A provider that cannot run stops the whole sync (syncAll turns it into
        // one sync.provider_unavailable); every other batch failure is non-fatal.
        Effect.catchAll(
          recoverUnlessProviderUnavailable((m) =>
            Effect.gen(function* () {
              yield* Ref.update(errorsRef, (e) => [...e, `triage batch ${batchIndex + 1}: ${m}`]);
              log(`[${accountEmail}] ERROR triage batch ${batchIndex + 1}: ${m}`);
              debug.error("triage batch failed", {
                account: accountEmail,
                batch: batchIndex + 1,
                error: m,
              });
              emit({
                type: "triage.batch.progress",
                account: accountEmail,
                batchIndex,
                totalBatches: batches.length,
                status: "failed",
                error: m,
              });
              return {
                persisted: 0,
                newLabelSuggestions: 0,
              };
            }),
          ),
        ),
      );

    const outcomes = yield* Effect.all(
      batches.map((batch, i) => runOneBatch(batch, i)),
      { concurrency: batchConcurrency },
    );

    const errors = yield* Ref.get(errorsRef);
    const triaged = outcomes.reduce((s, o) => s + o.persisted, 0);
    const suggestedNewLabels = outcomes.reduce((s, o) => s + o.newLabelSuggestions, 0);
    const failedBatches = outcomes.filter((o) => o.persisted === 0).length;

    emit({
      type: "triage.finished",
      account: accountEmail,
      triaged,
      suggestedNewLabels,
      elapsedMs: Date.now() - triageStartMs,
      failedBatches,
    });

    return { triaged, suggestedNewLabels, failedBatches, errors };
  });

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
