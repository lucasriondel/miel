import { Effect, Layer } from "effect";
import { syncAllEffect } from "./syncAll";
import { fetchAndTriageEffect } from "./fetchAndTriage";
import { triageUntriagedForAccountEffect } from "./triageUntriaged";
import { makeGmailLayer, makeClaudeLayer } from "./services";
// The sync programs read the triage batch settings, so the boundary that runs
// them provides the settings store alongside the Gmail/Claude adapters (#132).
import { StoresLive } from "../../stores/postgres";
import { runPromiseRethrow } from "../../util/effect";
import type { SyncAllOptions } from "./types";

// Re-export types
export type {
  SyncRunResult,
  NormalizedMessage,
  FetchAndTriageOptions,
  SyncAllOptions,
  TriageUntriagedOptions,
  TriageUntriagedResult,
  RunTrigger,
} from "./types";

// Re-export errors
export { AccountNotFoundError, LabelSyncError, MessageSearchError, ShellError } from "./errors";
export type { GrantError } from "./steps";

// Effect-native API: programs, phases, services/layers.
export { fetchAndTriageEffect } from "./fetchAndTriage";
export { syncAllEffect } from "./syncAll";
export { triageUntriagedForAccountEffect } from "./triageUntriaged";
export { fetchPhase, type FetchPhaseOptions, type FetchPhaseResult } from "./fetchPhase";
export { triagePhase, type TriagePhaseOptions, type TriagePhaseResult } from "./triagePhase";
export { GmailService, makeGmailLayer, makeClaudeLayer } from "./services";

// The Claude layer is the one that needs the stores (#133) — the live
// implementation reads the task's provider, model and credential — so the
// stores go *under* it and come back out for the pipeline's own reads.
const syncLayer = (opts: { gmail?: SyncAllOptions["gmail"]; claude?: SyncAllOptions["claude"] }) =>
  Layer.mergeAll(makeGmailLayer(opts.gmail), makeClaudeLayer(opts.claude)).pipe(
    Layer.provideMerge(StoresLive),
  );

export async function syncAll(opts: Parameters<typeof syncAllEffect>[0] = {}) {
  return runPromiseRethrow(syncAllEffect(opts).pipe(Effect.provide(syncLayer(opts))));
}

export async function fetchAndTriage(opts: Parameters<typeof fetchAndTriageEffect>[0]) {
  return runPromiseRethrow(fetchAndTriageEffect(opts).pipe(Effect.provide(syncLayer(opts))));
}

export async function triageUntriagedForAccount(
  opts: Parameters<typeof triageUntriagedForAccountEffect>[0],
) {
  const layer = makeClaudeLayer(opts.claude).pipe(Layer.provideMerge(StoresLive));
  return runPromiseRethrow(triageUntriagedForAccountEffect(opts).pipe(Effect.provide(layer)));
}
