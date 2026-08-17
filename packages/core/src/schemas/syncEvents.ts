import { z } from "zod";
import { DateRange } from "./api";

const SyncRunResult = z.object({
  account: z.string(),
  fetched: z.number().int(),
  triaged: z.number().int(),
  suggestedNewLabels: z.number().int(),
  filtersSynced: z.number().int(),
  suggestedFilters: z.number().int(),
  errors: z.array(z.string()),
});
export type SyncRunResultT = z.infer<typeof SyncRunResult>;

export const SyncStartMessage = z
  .object({
    type: z.literal("sync.start"),
    account: z.string().email().optional(),
    since: z.string().min(1).optional(),
    range: DateRange.optional(),
    max: z.number().int().positive().max(1000).optional(),
  })
  .refine((v) => !(v.since && v.range), {
    message: "Provide either `since` or `range`, not both.",
    path: ["range"],
  });
export type SyncStartMessageT = z.infer<typeof SyncStartMessage>;

export const TriageStartMessage = z.object({
  type: z.literal("triage.start"),
  account: z.string().email(),
});
export type TriageStartMessageT = z.infer<typeof TriageStartMessage>;

export const SyncStartedEvent = z.object({
  type: z.literal("sync.started"),
});
export type SyncStartedEventT = z.infer<typeof SyncStartedEvent>;

export const MailsFetchedEvent = z.object({
  type: z.literal("mails.fetched"),
  account: z.string(),
  count: z.number().int().nonnegative(),
});
export type MailsFetchedEventT = z.infer<typeof MailsFetchedEvent>;

export const TriageStartedEvent = z.object({
  type: z.literal("triage.started"),
  account: z.string(),
  totalBatches: z.number().int().nonnegative(),
});
export type TriageStartedEventT = z.infer<typeof TriageStartedEvent>;

export const TriageResultItem = z.object({
  id: z.string(),
  priority: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
  applyExistingLabels: z.array(z.string()),
  suggestNewLabels: z.array(
    z.object({
      name: z.string(),
      reasoning: z.string(),
    }),
  ),
});
export type TriageResultItemT = z.infer<typeof TriageResultItem>;

export const TriageBatchProgressEvent = z.object({
  type: z.literal("triage.batch.progress"),
  account: z.string(),
  batchIndex: z.number().int().nonnegative(),
  totalBatches: z.number().int().nonnegative(),
  status: z.enum(["started", "done", "failed"]),
  error: z.string().optional(),
  results: z.array(TriageResultItem).optional(),
});
export type TriageBatchProgressEventT = z.infer<typeof TriageBatchProgressEvent>;

export const LabelsStartedEvent = z.object({
  type: z.literal("labels.started"),
  account: z.string(),
});
export type LabelsStartedEventT = z.infer<typeof LabelsStartedEvent>;

export const LabelsFinishedEvent = z.object({
  type: z.literal("labels.finished"),
  account: z.string(),
  count: z.number().int().nonnegative(),
});
export type LabelsFinishedEventT = z.infer<typeof LabelsFinishedEvent>;

export const FiltersStartedEvent = z.object({
  type: z.literal("filters.started"),
  account: z.string(),
});
export type FiltersStartedEventT = z.infer<typeof FiltersStartedEvent>;

export const SearchStartedEvent = z.object({
  type: z.literal("search.started"),
  account: z.string(),
  query: z.string(),
  max: z.number().int(),
});
export type SearchStartedEventT = z.infer<typeof SearchStartedEvent>;

export const SearchFinishedEvent = z.object({
  type: z.literal("search.finished"),
  account: z.string(),
  count: z.number().int().nonnegative(),
});
export type SearchFinishedEventT = z.infer<typeof SearchFinishedEvent>;

export const SearchDedupeMessage = z.object({
  gmailMessageId: z.string(),
});
export type SearchDedupMessageT = z.infer<typeof SearchDedupeMessage>;

export const SearchDedupeFinishedEvent = z.object({
  type: z.literal("search.dedupe.finished"),
  account: z.string(),
  messages: z.array(SearchDedupeMessage),
});
export type SearchDedupeFinishedEventT = z.infer<typeof SearchDedupeFinishedEvent>;

export const FetchStartedEvent = z.object({
  type: z.literal("fetch.started"),
  account: z.string(),
  count: z.number().int().nonnegative(),
});
export type FetchStartedEventT = z.infer<typeof FetchStartedEvent>;

export const FetchedMessage = z.object({
  accountId: z.string(),
  gmailMessageId: z.string(),
  gmailThreadId: z.string(),
  fromEmail: z.string(),
  fromName: z.string().nullable(),
  subject: z.string().nullable(),
  snippet: z.string().nullable(),
  internalDate: z.string(),
  labelIds: z.array(z.string()),
});
export type FetchedMessageT = z.infer<typeof FetchedMessage>;

export const FetchBatchProgressEvent = z.object({
  type: z.literal("fetch.batch.progress"),
  account: z.string(),
  batchIndex: z.number().int().nonnegative(),
  totalBatches: z.number().int().nonnegative(),
  status: z.enum(["started", "done"]),
  messages: z.array(FetchedMessage).optional(),
});
export type FetchBatchProgressEventT = z.infer<typeof FetchBatchProgressEvent>;

export const FetchFinishedEvent = z.object({
  type: z.literal("fetch.finished"),
  account: z.string(),
  count: z.number().int().nonnegative(),
});
export type FetchFinishedEventT = z.infer<typeof FetchFinishedEvent>;

export const TriageFinishedEvent = z.object({
  type: z.literal("triage.finished"),
  account: z.string(),
  triaged: z.number().int().nonnegative(),
  suggestedNewLabels: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative(),
  failedBatches: z.number().int().nonnegative(),
});
export type TriageFinishedEventT = z.infer<typeof TriageFinishedEvent>;

export const FiltersFinishedEvent = z.object({
  type: z.literal("filters.finished"),
  account: z.string(),
  suggestedFilters: z.number().int().nonnegative(),
});
export type FiltersFinishedEventT = z.infer<typeof FiltersFinishedEvent>;

export const SyncFinishedEvent = z.object({
  type: z.literal("sync.finished"),
  runs: z.array(SyncRunResult),
});
export type SyncFinishedEventT = z.infer<typeof SyncFinishedEvent>;

export const SyncErrorEvent = z.object({
  type: z.literal("sync.error"),
  message: z.string(),
});
export type SyncErrorEventT = z.infer<typeof SyncErrorEvent>;

// Emitted when an account's Google grant is missing or revoked mid-sync
// (TokenRefreshError / GmailAuthError / AccountNotConnectedError). The web shows
// a "Reconnect with Google" action that opens the OAuth consent flow.
export const SyncReconnectRequiredEvent = z.object({
  type: z.literal("sync.reconnect_required"),
  account: z.string(),
});
export type SyncReconnectRequiredEventT = z.infer<typeof SyncReconnectRequiredEvent>;

// Emitted when the AI provider cannot run: no Claude Code token, a token the
// CLI rejected, or a task pointed at a hosted vendor with no stored key (#126 —
// `reason` is the tag). Carries no account: the credential and the provider pick
// are global, so every account would fail the same way. The web dismisses the
// hung loaders and points at Settings.
export const SyncProviderUnavailableEvent = z.object({
  type: z.literal("sync.provider_unavailable"),
  reason: z.string().optional(),
});
export type SyncProviderUnavailableEventT = z.infer<typeof SyncProviderUnavailableEvent>;

// The name that event had until #127, when it stopped being about Claude: it
// fires for a keyless OpenAI too, so `sync.claude_unavailable` said something
// untrue about which credential the user has to go and fix.
//
// A one-release compatibility alias, and only for the client's parse — it is
// absent from `SyncServerEvent` below, so nothing here can still emit it, and
// present in `ReceivedSyncServerEvent`, so a browser holding this release's
// bundle still understands the previous release's API. REMOVABLE NEXT RELEASE:
// delete this schema, the `ReceivedSyncServerEvent` union it is the only reason
// for, and the alias case in the web client's `dispatchEvent`.
export const SyncClaudeUnavailableEventAlias = z.object({
  type: z.literal("sync.claude_unavailable"),
  reason: z.string().optional(),
});
export type SyncClaudeUnavailableEventAliasT = z.infer<typeof SyncClaudeUnavailableEventAlias>;

export const SyncServerEvent = z.discriminatedUnion("type", [
  SyncStartedEvent,
  LabelsStartedEvent,
  LabelsFinishedEvent,
  FiltersStartedEvent,
  SearchStartedEvent,
  SearchFinishedEvent,
  SearchDedupeFinishedEvent,
  FetchStartedEvent,
  FetchBatchProgressEvent,
  FetchFinishedEvent,
  MailsFetchedEvent,
  TriageStartedEvent,
  TriageBatchProgressEvent,
  TriageFinishedEvent,
  FiltersFinishedEvent,
  SyncFinishedEvent,
  SyncErrorEvent,
  SyncReconnectRequiredEvent,
  SyncProviderUnavailableEvent,
]);
export type SyncServerEventT = z.infer<typeof SyncServerEvent>;

/**
 * What a client parses: everything the server emits, plus the deprecated
 * {@link SyncClaudeUnavailableEventAlias} (#127). The two unions are separate on
 * purpose — the sending side must not be able to reach for the old name, and the
 * receiving side must not drop it while a previous-release API is still up.
 */
export const ReceivedSyncServerEvent = z.discriminatedUnion("type", [
  ...SyncServerEvent.options,
  SyncClaudeUnavailableEventAlias,
]);
export type ReceivedSyncServerEventT = z.infer<typeof ReceivedSyncServerEvent>;

export const SyncClientMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("sync.start"),
    account: z.string().email().optional(),
    since: z.string().min(1).optional(),
    range: DateRange.optional(),
    max: z.number().int().positive().max(1000).optional(),
  }),
]);
export type SyncClientMessageT = z.infer<typeof SyncClientMessage>;
