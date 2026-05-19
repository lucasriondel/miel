export * from "./env";
export * as schema from "./db/schema";
export { getDb } from "./db/client";
export type { Db } from "./db/client";
export { runMigrations } from "./db/migrate";

export * as gmailSchemas from "./schemas/gmail";
export { createGogAdapter } from "./adapters/gog";
export type { GogAdapter, SearchHit, SendResult } from "./adapters/gog";
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
