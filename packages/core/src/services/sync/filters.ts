import { Effect } from "effect";
import type { SyncServerEventT } from "../../schemas/syncEvents";
import type { NormalizedMessage } from "./types";
import type { LabelRow } from "../labels";
import type { Claude } from "../../claude/Claude";
import type { LabelStore } from "../../stores/contracts";
import { suggestFiltersForBatchEffect } from "../filters";
import type { ProviderUnavailableError } from "../../errors";
import { recoverUnlessProviderUnavailable } from "./providerFailure";

interface RunFilterSuggestResult {
  suggestedFilters: number;
  errors: string[];
}

export const runFilterSuggest = (args: {
  accountId: string;
  accountEmail: string;
  normalized: NormalizedMessage[];
  labelsByGmailId: Map<string, LabelRow>;
  emit: (e: SyncServerEventT) => void;
  log: (m: string) => void;
}): Effect.Effect<RunFilterSuggestResult, ProviderUnavailableError, Claude | LabelStore> =>
  Effect.gen(function* () {
    args.emit({ type: "filters.started", account: args.accountEmail });

    const proposals = yield* suggestFiltersForBatchEffect({
      accountId: args.accountId,
      accountEmail: args.accountEmail,
      messages: args.normalized.map((m) => ({
        id: m.gmailMessageId,
        from: m.fromEmail,
        subject: m.subject,
        snippet: m.snippet,
        currentLabels: m.labelIds
          .map((id) => args.labelsByGmailId.get(id)?.name)
          .filter((n): n is string => Boolean(n)),
      })),
    });

    args.log(
      `[${args.accountEmail}] filter suggestions: ${proposals.created} new, ${proposals.skipped} skipped`,
    );
    return { suggestedFilters: proposals.created, errors: [] };
  }).pipe(
    // The same classification triage uses, from the same predicate: a provider
    // that cannot run propagates so syncAll can emit sync.provider_unavailable,
    // and every other failure is non-fatal — record it and let the sync continue.
    Effect.catchAll(
      recoverUnlessProviderUnavailable((m) =>
        Effect.succeed({ suggestedFilters: 0, errors: [`filterSuggest: ${m}`] }),
      ),
    ),
  );
