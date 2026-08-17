export * from "./env";
export { APP_BASE_PATH, APP_BASE_URL, webAppUrl } from "./appBasePath";
export {
  CONNECT_RETURN_TARGETS,
  DEFAULT_CONNECT_RETURN_TARGET,
  connectReturnPath,
  connectReturnUrl,
  parseConnectReturnTarget,
} from "./connectReturn";
export type { ConnectOutcome, ConnectReturnTarget } from "./connectReturn";
export { createDebug } from "./util/debug";
export type { DebugLogger, LogLevel } from "./util/debug";
export * as schema from "./db/schema";
export { getDb, closeDb } from "./db/client";
export type { Db } from "./db/client";
export { runMigrations } from "./db/migrate";

export * as gmailSchemas from "./schemas/gmail";
export * as triageSchemas from "./schemas/triage";
export * as replySchemas from "./schemas/reply";
export * as apiSchemas from "./schemas/api";
export * as filterSuggestSchemas from "./schemas/filterSuggest";
export * as syncEventSchemas from "./schemas/syncEvents";

// ── Direct Google API + Claude services (Effect) ────────────────────────────
export * as errors from "./errors";
// The one classification of "the AI provider cannot run" (#126). Named at the
// top level, not just inside the namespace, because the boundaries that consume
// it — the API's error middleware and the sync WebSocket — are the places that
// used to keep their own copy of the tag list.
export { isProviderUnavailable, PROVIDER_UNAVAILABLE_TAGS } from "./errors";
export type { ProviderUnavailableError } from "./errors";
export {
  GoogleAuth,
  GmailMessages,
  GmailLabels,
  GmailFilters,
  GmailThreads,
  GmailModify,
  GmailProfile,
  refKey,
} from "./google/contracts";
export type {
  AccountRef,
  AccountProfile,
  SearchHit as GmailSearchHit,
  SendResult as GmailSendResult,
  SendReplyInput,
  FilterSpec,
  TokenGrant,
} from "./google/contracts";
export { GoogleAuthLive } from "./google/GoogleAuth";
export { GoogleStack, AppLive } from "./google/layers";
export { runWithGoogleAuth, runWithApp, exchangeCodeAndProfile } from "./google/runtime";
export { GOOGLE_SCOPES, type GoogleScope } from "./google/scopes";
export {
  googleOAuthConfigStatus,
  missingOAuthEnv,
  type GoogleOAuthConfigStatus,
} from "./google/oauthClient";
// The setup walkthrough the README, the landing page and the onboarding gate
// all render (#138), beside the callback path the API serves it at.
export {
  DEV_GOOGLE_REDIRECT_URI,
  GOOGLE_OAUTH_CALLBACK_PATH,
  GOOGLE_OAUTH_ENV_KEYS,
  GOOGLE_OAUTH_SETUP_STEPS,
  type GoogleOAuthSetupStep,
} from "./googleOAuthSetup";
export {
  DEFAULT_TRIAGE_BATCH_SIZE,
  MAX_TRIAGE_BATCH_SIZE,
  REPLY_BODY_TRUNCATION,
} from "./claudeUsage";
// The one injection seam for the Claude dependency (#133): the tag everything
// that needs a model depends on, its live layer, and the interface a fake
// answers for.
export { Claude, ClaudeLive } from "./claude/Claude";
export type { ClaudeImpl, ClaudeRunResult as ClaudeRunResultT } from "./claude/Claude";

// Which provider can run a task and which models it offers (#105). A leaf
// module, also reachable as `@miel/core/providerModels` so the web build can
// drive its pickers off the same catalogue the API validates against.
export {
  DEFAULT_PROVIDER,
  PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_MODELS,
  defaultModelFor,
  isHostedProvider,
  isModelForProvider,
  isProvider,
  normalizeModelId,
  normalizeProvider,
} from "./providerModels";
export type { Provider, ProviderModel } from "./providerModels";
export {
  MODEL_TASKS,
  SETTING_KEYS,
  SETTING_DEFAULTS,
  getSetting,
  setSetting,
  getModelSettings,
  updateModelSettings,
  getScheduleSettings,
  updateScheduleSettings,
  getTriageBatchSettings,
  updateTriageBatchSettings,
} from "./services/settings";
export type {
  ModelSettings,
  ModelTask,
  ScheduleSettings,
  TriageBatchSettings,
} from "./services/settings";
// The save-time provider doors (#124): the checked way to point a task at a
// provider, and the resolver that says which one it runs on. The plain writers
// above stay exported — a caller that wants the rule enforced calls these.
export {
  checkedUpdateModelSettings,
  checkedUpdateModelSettingsEffect,
  checkedDeleteProviderCredential,
  checkedDeleteProviderCredentialEffect,
  resolveTaskProvider,
  resolveTaskProviderEffect,
  rejectModelPatch,
  rejectCredentialDeletion,
  taskProviderProblem,
} from "./services/taskProviders";
export type { ResolvedTaskProvider, ConfiguredProviders } from "./services/taskProviders";
// Provider credentials: presence + masked hint only. `readProviderCredentialEffect`
// (the decrypted key) is deliberately NOT re-exported — in-core callers import
// `./services/encryptedSecrets` directly, and nothing outside core may read it.
export {
  CREDENTIAL_PROVIDERS,
  isCredentialProvider,
  maskCredential,
  getProviderCredentialStatus,
  setProviderCredential,
  deleteProviderCredential,
  getProviderCredentialStatusEffect,
  setProviderCredentialEffect,
  deleteProviderCredentialEffect,
} from "./services/encryptedSecrets";
export type { CredentialProvider, ProviderCredentialStatus } from "./services/encryptedSecrets";
// The Claude Code token: presence and a masked hint — never the token.
// `readClaudeCodeTokenEffect` is deliberately NOT re-exported for the same
// reason `readProviderCredentialEffect` isn't (#109).
export {
  CLAUDE_CODE_TOKEN_SECRET,
  getClaudeCodeTokenStatus,
  setClaudeCodeToken,
  deleteClaudeCodeToken,
  getClaudeCodeTokenStatusEffect,
  setClaudeCodeTokenEffect,
  deleteClaudeCodeTokenEffect,
} from "./services/claudeCodeToken";
export type { ClaudeCodeTokenStatus } from "./services/claudeCodeToken";
export { createScheduler, registerScheduler, getScheduleStatus } from "./services/scheduler";
export type { Scheduler, SchedulerDeps, ScheduleStatus } from "./services/scheduler";
export { isSyncInFlight, tryAcquireSyncLock, releaseSyncLock } from "./services/syncLock";
export {
  getAccountByEmail,
  connectAccount,
  refreshAccountProfile,
  removeAccount,
} from "./services/accounts";
export type { SyncedAccount, ConnectAccountInput, RemovedAccount } from "./services/accounts";
export {
  syncLabelsForAccount,
  getLabelsForAccount,
  getLabelsByGmailIds,
  ensureLabel,
} from "./services/labels";
export type { LabelRow } from "./services/labels";
export {
  syncFiltersForAccount,
  listFiltersForAccount,
  listAllFilters,
  deleteFilterForAccount,
  mergeFiltersForAccount,
  listSuggestedFilters,
  suggestFiltersForBatch,
  suggestFilterForMessage,
  acceptSuggestedFilter,
  dismissSuggestedFilter,
} from "./services/filters";
export type {
  GmailFilterRow,
  MergeFiltersResult,
  FilterDeletionFailure,
  SuggestedFilterRow,
  SuggestedFilterWithAccount,
  SuggestFilterForMessageResult,
} from "./services/filters";
export { fetchAndTriage, syncAll, triageUntriagedForAccount } from "./services/sync";
export type {
  SyncRunResult,
  FetchAndTriageOptions,
  SyncAllOptions,
  TriageUntriagedOptions,
  TriageUntriagedResult,
} from "./services/sync";
export {
  applyLabels,
  applySuggestions,
  archiveMessage,
  trashMessage,
  setMessageRead,
  batchModifyMessages,
  getLatestTriageForMessage,
} from "./services/apply";
export type {
  ApplyLabelsResult,
  ApplySuggestionsInput,
  ApplySuggestionsResult,
  BatchMessageAction,
  BatchModifyMessagesResult,
  LatestTriageForMessage,
} from "./services/apply";
export {
  listMessages,
  getMessageDetail,
  listAccounts as listAccountsFromDb,
  getAccountById,
  setMessagePriority,
} from "./services/messages";
export type {
  ListedMessage,
  ListedAttachment,
  ListMessagesArgs,
  ListMessagesResult,
  MessageDetail,
  AccountSummary,
} from "./services/messages";
export { generateReply, sendReply } from "./services/reply";
export type {
  GenerateReplyArgs,
  GenerateReplyResult,
  SendReplyArgs,
  SendReplyResult,
} from "./services/reply";
export {
  downloadAttachment,
  downloadAttachmentEffect,
  AttachmentNotFoundError,
} from "./services/attachments";
export type { DownloadAttachmentArgs, DownloadedAttachment } from "./services/attachments";
export {
  listRuns,
  listRunsEffect,
  markStaleRunsFailed,
  markStaleRunsFailedEffect,
} from "./services/logs";
// `readWorpConfigEffect` is deliberately NOT re-exported: it returns the
// decrypted worp key and proxy headers, so it stays in-core like
// `readProviderCredentialEffect`. The settings surface below is the outward
// view — base URL in the clear, presence + masked hints for the secrets.
export { sendToWorp, sendToWorpEffect, postToWorpIngest } from "./services/sendToWorp";
export {
  getWorpSettings,
  getWorpSettingsEffect,
  updateWorpSettings,
  updateWorpSettingsEffect,
} from "./services/worpSettings";
export type { WorpSettings, WorpSettingsPatch } from "./services/worpSettings";
export {
  CF_ACCESS_HEADERS,
  isValidHeaderName,
  isReservedHeaderName,
  mergeExtraHeaders,
  validateExtraHeaderPatch,
  validateExtraHeaders,
} from "./worpConfig";
export type {
  MaskedHeader,
  WorpExtraHeaders,
  WorpExtraHeadersPatch,
  HeaderMapProblem,
} from "./worpConfig";
export type { SendToWorpArgs, WorpFlow, WorpConfig, WorpUploadResult } from "./services/sendToWorp";
export type { LogEntry, SyncLogEntry, TriageLogEntry } from "./services/logs";
export type { RunTrigger } from "./services/sync";
export { parseSince, resolveSyncRange } from "./util/time";
export type { ResolvedSyncRange, DateRange } from "./util/time";
export { spawnCapture, spawnJson, spawnVoid, ShellError } from "./adapters/shell";
export {
  extractBodies,
  extractHeaders,
  parseFromHeader,
  parseAddressList,
  parseInternalDate,
} from "./util/gmailPayload";

// Effect-native API. Promise exports above are facades over these; depend on
// the Effect variants when composing inside an Effect program.
export { runPromiseRethrow, tryAsync, toError } from "./util/effect";
export { spawnCaptureEffect, spawnJsonEffect, spawnVoidEffect } from "./adapters/shell";
export {
  getSettingEffect,
  setSettingEffect,
  getModelSettingsEffect,
  updateModelSettingsEffect,
  getScheduleSettingsEffect,
  updateScheduleSettingsEffect,
  getTriageBatchSettingsEffect,
  updateTriageBatchSettingsEffect,
  UnknownSettingError,
} from "./services/settings";
export {
  getAccountByEmailEffect,
  connectAccountEffect,
  refreshAccountProfileEffect,
  removeAccountEffect,
} from "./services/accounts";
export {
  syncLabelsForAccountEffect,
  getLabelsForAccountEffect,
  getLabelsByGmailIdsEffect,
  ensureLabelEffect,
} from "./services/labels";
export {
  syncFiltersForAccountEffect,
  listFiltersForAccountEffect,
  listAllFiltersEffect,
  deleteFilterForAccountEffect,
  mergeFiltersForAccountEffect,
  listSuggestedFiltersEffect,
  suggestFiltersForBatchEffect,
  suggestFilterForMessageEffect,
  acceptSuggestedFilterEffect,
  dismissSuggestedFilterEffect,
} from "./services/filters";
export {
  applyLabelsEffect,
  applySuggestionsEffect,
  archiveMessageEffect,
  trashMessageEffect,
  setMessageReadEffect,
  batchModifyMessagesEffect,
  getLatestTriageForMessageEffect,
} from "./services/apply";
export {
  listMessagesEffect,
  getMessageDetailEffect,
  listAccountsEffect as listAccountsFromDbEffect,
  getAccountByIdEffect,
  setMessagePriorityEffect,
} from "./services/messages";
export { generateReplyEffect, sendReplyEffect } from "./services/reply";
export {
  fetchAndTriageEffect,
  syncAllEffect,
  triageUntriagedForAccountEffect,
  fetchPhase,
  triagePhase,
  GmailService,
  makeGmailLayer,
  makeClaudeLayer,
} from "./services/sync";
export type {
  FetchPhaseOptions,
  FetchPhaseResult,
  TriagePhaseOptions,
  TriagePhaseResult,
} from "./services/sync";
