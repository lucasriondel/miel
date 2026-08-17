import { Effect, Either } from "effect";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { accounts } from "../../db/schema";
import type { SyncAllOptions, SyncRunResult } from "./types";
import { fetchAndTriageEffect } from "./fetchAndTriage";
import { GmailService } from "./services";
import type { Claude } from "../../claude/Claude";
import { isProviderUnavailable } from "../../errors";
import type { LabelStore, SettingsStore } from "../../stores/contracts";
import { createDebug } from "../../util/debug";

const debug = createDebug("service:sync:syncAll");

/** Tags that mean a Google account must be reconnected (grant missing/revoked). */
const RECONNECT_TAGS = new Set(["TokenRefreshError", "GmailAuthError", "AccountNotConnectedError"]);

function tagOf(err: unknown): string | undefined {
  return (err as { _tag?: string })?._tag;
}

const failedRun = (account: string, error: string): SyncRunResult => ({
  account,
  fetched: 0,
  triaged: 0,
  suggestedNewLabels: 0,
  filtersSynced: 0,
  suggestedFilters: 0,
  errors: [error],
});

export const syncAllEffect = (
  opts: SyncAllOptions = {},
): Effect.Effect<SyncRunResult[], never, GmailService | Claude | SettingsStore | LabelStore> =>
  Effect.gen(function* () {
    debug.info("syncAll start", {
      accountEmail: opts.accountEmail ?? "(all)",
      since: opts.since,
      range: opts.range,
      max: opts.max,
    });

    // Accounts are connected via the in-app OAuth flow (stored in the DB), so
    // there is no external account enumeration step any more — we sync whatever
    // connected accounts the DB holds.
    const { db } = getDb();
    const targets = yield* Effect.promise(() =>
      opts.accountEmail
        ? db
            .select({ email: accounts.email })
            .from(accounts)
            .where(eq(accounts.email, opts.accountEmail))
        : db.select({ email: accounts.email }).from(accounts),
    );

    debug.info("syncAll targets", { count: targets.length });

    const log = opts.log ?? (() => {});
    const emit = opts.onEvent;
    const results: SyncRunResult[] = [];

    for (const target of targets) {
      const runResult = yield* fetchAndTriageEffect({
        accountEmail: target.email,
        since: opts.since,
        range: opts.range,
        max: opts.max,
        gmail: opts.gmail,
        claude: opts.claude,
        log: opts.log,
        onEvent: opts.onEvent,
        triage: opts.triage,
        trigger: opts.trigger,
      }).pipe(Effect.either);

      if (Either.isRight(runResult)) {
        results.push(runResult.right);
        continue;
      }

      const err = runResult.left;
      const tag = tagOf(err);
      // Several tagged errors carry their specifics in fields rather than in a
      // message (a refused provider names its task, vendor and reason), so an
      // empty message falls back to the tag — a run recorded as
      // `provider_unavailable:` with nothing after it says nothing.
      const message = (err instanceof Error ? err.message : String(err)) || (tag ?? "unknown");

      // A revoked/missing Google grant: prompt the user to reconnect, skip on.
      if (tag && RECONNECT_TAGS.has(tag)) {
        log(`[${target.email}] needs to reconnect with Google`);
        emit?.({ type: "sync.reconnect_required", account: target.email });
        results.push(failedRun(target.email, `reconnect_required: ${message}`));
        continue;
      }

      // The provider cannot run — no Claude Code token, a token the CLI
      // rejected, or a task pointed at a vendor with no stored key (#126).
      // Signal once and stop: the credential and the provider pick are global,
      // so every remaining account would fail the same way.
      if (isProviderUnavailable(err)) {
        log(`[${target.email}] the AI provider is unavailable (${err._tag})`);
        emit?.({ type: "sync.provider_unavailable", reason: err._tag });
        results.push(failedRun(target.email, `provider_unavailable: ${message}`));
        break;
      }

      // Unexpected error — surface as a defect.
      yield* Effect.die(err);
    }

    debug.info("syncAll done", { runs: results.length });
    return results;
  });
