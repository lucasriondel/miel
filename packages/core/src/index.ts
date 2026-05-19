export * from "./env";
export * as schema from "./db/schema";
export { getDb } from "./db/client";
export type { Db } from "./db/client";
export { runMigrations } from "./db/migrate";

export * as gmailSchemas from "./schemas/gmail";
export * as triageSchemas from "./schemas/triage";
export * as replySchemas from "./schemas/reply";
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
