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

export const TriageBatchProgressEvent = z.object({
  type: z.literal("triage.batch.progress"),
  account: z.string(),
  batchIndex: z.number().int().nonnegative(),
  totalBatches: z.number().int().nonnegative(),
  status: z.enum(["started", "done", "failed"]),
  error: z.string().optional(),
});
export type TriageBatchProgressEventT = z.infer<typeof TriageBatchProgressEvent>;

export const FiltersStartedEvent = z.object({
  type: z.literal("filters.started"),
  account: z.string(),
});
export type FiltersStartedEventT = z.infer<typeof FiltersStartedEvent>;

export const TriageFinishedEvent = z.object({
  type: z.literal("triage.finished"),
  account: z.string(),
  triaged: z.number().int().nonnegative(),
  suggestedNewLabels: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative(),
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

// Emitted when a gog call throws invalid_grant for an account mid-sync. With
// `sessionId`+`url` the web shows a paste-back toast directly; signal-only (no
// url/sessionId) falls back to a click-to-start REST button.
export const SyncReauthRequiredEvent = z.object({
  type: z.literal("sync.reauth_required"),
  account: z.string(),
  sessionId: z.string().optional(),
  url: z.string().url().optional(),
});
export type SyncReauthRequiredEventT = z.infer<typeof SyncReauthRequiredEvent>;

// Emitted when the Claude CLI reports it isn't logged in during triage. The
// login is global (not per-account), so this carries no account and is emitted
// at most once per run. With `sessionId`+`url` the web shows a paste-back toast
// directly; signal-only falls back to a click-to-start button.
export const SyncClaudeLoginRequiredEvent = z.object({
  type: z.literal("sync.claude_login_required"),
  sessionId: z.string().optional(),
  url: z.string().url().optional(),
});
export type SyncClaudeLoginRequiredEventT = z.infer<
  typeof SyncClaudeLoginRequiredEvent
>;

export const SyncServerEvent = z.discriminatedUnion("type", [
  SyncStartedEvent,
  MailsFetchedEvent,
  TriageStartedEvent,
  TriageBatchProgressEvent,
  FiltersStartedEvent,
  TriageFinishedEvent,
  FiltersFinishedEvent,
  SyncFinishedEvent,
  SyncErrorEvent,
  SyncReauthRequiredEvent,
  SyncClaudeLoginRequiredEvent,
]);
export type SyncServerEventT = z.infer<typeof SyncServerEvent>;

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
