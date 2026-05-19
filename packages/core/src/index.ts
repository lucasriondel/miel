export * from "./env";
export * as schema from "./db/schema";
export { getDb, closeDb } from "./db/client";
export type { Db } from "./db/client";
export { runMigrations } from "./db/migrate";

export * as gmailSchemas from "./schemas/gmail";
export * as triageSchemas from "./schemas/triage";
export * as replySchemas from "./schemas/reply";
export * as apiSchemas from "./schemas/api";
export { createGogAdapter } from "./adapters/gog";
export type { GogAdapter, SearchHit, SendResult } from "./adapters/gog";
export { createClaudeAdapter } from "./adapters/claude";
export type { ClaudeAdapter, ClaudeRunResult } from "./adapters/claude";
export {
  SETTING_KEYS,
  SETTING_DEFAULTS,
  getSetting,
  setSetting,
  getModelSettings,
  updateModelSettings,
} from "./services/settings";
export type { ModelSettings } from "./services/settings";
export {
  syncAccountsFromGog,
  getAccountByEmail,
} from "./services/accounts";
export type { SyncedAccount } from "./services/accounts";
export {
  syncLabelsForAccount,
  getLabelsForAccount,
  getLabelsByGmailIds,
  ensureLabel,
} from "./services/labels";
export type { LabelRow } from "./services/labels";
export { fetchAndTriage, syncAll } from "./services/sync";
export type {
  SyncRunResult,
  FetchAndTriageOptions,
  SyncAllOptions,
} from "./services/sync";
export {
  applyLabels,
  applySuggestions,
  archiveMessage,
  trashMessage,
  getLatestTriageForMessage,
} from "./services/apply";
export type {
  ApplyLabelsResult,
  ApplySuggestionsInput,
  ApplySuggestionsResult,
  LatestTriageForMessage,
} from "./services/apply";
export {
  listMessages,
  getMessageDetail,
  listAccounts as listAccountsFromDb,
  getAccountById,
} from "./services/messages";
export type {
  ListedMessage,
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
export { parseSince } from "./util/time";
export {
  spawnCapture,
  spawnJson,
  spawnVoid,
  ShellError,
} from "./adapters/shell";
export {
  extractBodies,
  extractHeaders,
  parseFromHeader,
  parseAddressList,
  parseInternalDate,
} from "./util/gmailPayload";
