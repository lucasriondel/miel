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
export * as promoSchemas from "./schemas/promo";
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
  GmailDrafts,
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
  SendMessageInput,
  SavedDraft as GmailSavedDraft,
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
  BODY_BEARING_TASKS,
  DEFAULT_TRIAGE_BATCH_SIZE,
  MAX_TRIAGE_BATCH_SIZE,
  REPLY_BODY_TRUNCATION,
} from "./claudeUsage";
export type { BodyBearingTask } from "./claudeUsage";
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
} from "./services/filters";
export type { GmailFilterRow, MergeFiltersResult, FilterDeletionFailure } from "./services/filters";
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
  archiveMessage,
  trashMessage,
  unarchiveMessage,
  untrashMessage,
  setMessageRead,
  batchModifyMessages,
} from "./services/apply";
export type {
  ApplyLabelsResult,
  BatchMessageAction,
  BatchMessageActionInput,
  BatchModifyMessagesResult,
} from "./services/apply";
export {
  listMessages,
  getMessageDetail,
  listAccounts as listAccountsFromDb,
  getAccountById,
  setAccountNickname,
  setMessagePriority,
  MAX_NICKNAME_LENGTH,
} from "./services/messages";
export type {
  ListedMessage,
  ListedAttachment,
  ListMessagesArgs,
  ListMessagesResult,
  MessageDetail,
  AccountSummary,
} from "./services/messages";
// The suggestions the inbox section reads (#160), the save that takes one out of
// it (#161), the saved promos the Promo Codes page lists (#162), the copy of the
// mail one of them came from (#163), the two acts that make the page the
// user's — correcting the guesses and removing a row (#164) — the page's own
// read of every detection, which is where the ones past the inbox's cap are
// reachable (#154), and the run one message at a time the detail page asks for
// (#165).
//
// That last one is why the sync's own extraction is still absent here: it takes
// what a fetch just brought in and has no caller outside `sync/fetchPhase`,
// while `extractPromosForMessage` is the door a boundary knocks on.
export {
  clearExpiredSavedPromos,
  deleteSavedPromo,
  extractPromosForMessage,
  listPromoSuggestions,
  listSavedPromos,
  listSuggestedPromos,
  readSavedPromoMail,
  savePromo,
  updateSavedPromo,
} from "./services/promoCodes";
export type {
  ClearExpiredPromosArgs,
  EditedPromo,
  ExtractPromosForMessageArgs,
  ExtractPromosForMessageResult,
  ListPromoSuggestionsArgs,
  ListSavedPromosArgs,
  PromoFieldsPatch,
  PromoSuggestion,
  PromoListing,
  SavedPromoMail,
  SavedPromosPage,
  SavePromoArgs,
  SavePromoResult,
} from "./services/promoCodes";
export {
  forwardMessage,
  generateNewMessage,
  generateReply,
  quotePreview,
  sendNewMessage,
  sendReply,
} from "./services/reply";
export type {
  ForwardMessageArgs,
  GenerateNewMessageArgs,
  GenerateReplyArgs,
  GenerateReplyResult,
  PreviousDraft,
  QuotePreview,
  SendMessageResult,
  SendNewMessageArgs,
  SendReplyArgs,
  SendReplyResult,
} from "./services/reply";
export type { QuoteBlock } from "./services/quoting";
// Stopping an AI draft server-side: the request id a generation runs under.
export { cancelGeneration } from "./services/generations";
export type { Cancellation } from "./services/generations";
// Attachments staged for a send, the addresses an account may send as, and the
// address suggestions.
export { removeUpload, uploadAttachment } from "./services/uploads";
export type { UploadedAttachment, UploadAttachmentArgs } from "./services/uploads";
export { MAX_ATTACHMENTS_BYTES, UPLOAD_TTL_MS } from "./composeLimits";
export { listSendAs } from "./services/sendAs";
export type { SendAsAlias } from "./google/gmailAdapter";
export { suggestContacts, MAX_CONTACT_SUGGESTIONS } from "./services/contacts";
export type { ContactSuggestion } from "./services/contacts";
// Snooze and schedule send — miel's own, since Gmail's API has neither — and
// the loop that wakes and sends them when they fall due.
export { snoozeMessage, unsnoozeMessage } from "./services/snooze";
export type { SnoozeArgs, SnoozeResult } from "./services/snooze";
export {
  cancelScheduled,
  listScheduled,
  reschedule,
  scheduleSend,
  MAX_SEND_ATTEMPTS,
  STALE_CLAIM_MS,
} from "./services/scheduledSends";
export type { ScheduleSendArgs, ScheduledSendView } from "./services/scheduledSends";
export { createDueWorkLoop } from "./services/dueWork";
export type { DueWorkDeps, DueWorkLoop, DueWorkTickResult } from "./services/dueWork";
// The Google OAuth client entered in the app (the database's, with the
// environment as the fallback). The resolver that carries the decrypted secret
// is deliberately absent: `GoogleAuth` imports it from the module.
export {
  clearGoogleOAuthConfig,
  getGoogleOAuthStatus,
  saveGoogleOAuthConfig,
  redirectUriProblem,
} from "./services/googleOAuthConfig";
export type {
  GoogleOAuthSource,
  GoogleOAuthStatus,
  SaveGoogleOAuthConfigArgs,
  SaveGoogleOAuthConfigResult,
} from "./services/googleOAuthConfig";
// The compose window's autosave into Gmail drafts.
export { deleteDraft, saveDraft } from "./services/drafts";
export type { SaveDraftArgs, SaveDraftResult } from "./services/drafts";
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
// A message body as visible text — what the promo-extract task reads instead of
// raw HTML (#156).
export { htmlToVisibleText } from "./util/htmlText";

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
} from "./services/filters";
export {
  applyLabelsEffect,
  archiveMessageEffect,
  trashMessageEffect,
  unarchiveMessageEffect,
  untrashMessageEffect,
  setMessageReadEffect,
  batchModifyMessagesEffect,
} from "./services/apply";
export {
  listMessagesEffect,
  getMessageDetailEffect,
  listAccountsEffect as listAccountsFromDbEffect,
  getAccountByIdEffect,
  setAccountNicknameEffect,
  setMessagePriorityEffect,
} from "./services/messages";
export {
  forwardMessageEffect,
  generateNewMessageEffect,
  generateReplyEffect,
  quotePreviewEffect,
  sendNewMessageEffect,
  sendReplyEffect,
} from "./services/reply";
export {
  snoozeMessageEffect,
  unsnoozeMessageEffect,
  wakeDueSnoozesEffect,
} from "./services/snooze";
export {
  cancelScheduledEffect,
  listScheduledEffect,
  rescheduleEffect,
  runDueScheduledSendsEffect,
  scheduleSendEffect,
} from "./services/scheduledSends";
export { removeUploadEffect, sweepUploadsEffect, uploadAttachmentEffect } from "./services/uploads";
export { harvestSentContactsEffect, suggestContactsEffect } from "./services/contacts";
export { listSendAsEffect } from "./services/sendAs";
export { deleteDraftEffect, saveDraftEffect } from "./services/drafts";
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
