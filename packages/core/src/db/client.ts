import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "../env";
import { createDebug } from "../util/debug";
import * as schema from "./schema";

const debug = createDebug("db");

let cachedSql: ReturnType<typeof postgres> | null = null;
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

function redactConnectionString(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "(unparseable)";
  }
}

export function getDb() {
  if (cachedDb && cachedSql) return { db: cachedDb, sql: cachedSql };
  const { DATABASE_URL } = getEnv();
  debug("connect", { url: redactConnectionString(DATABASE_URL) });
  cachedSql = postgres(DATABASE_URL);
  cachedDb = drizzle(cachedSql, { schema });
  return { db: cachedDb, sql: cachedSql };
}

export async function closeDb(): Promise<void> {
  if (cachedSql) {
    debug("close");
    await cachedSql.end({ timeout: 5 });
    cachedSql = null;
    cachedDb = null;
  }
}

export type Db = ReturnType<typeof getDb>["db"];
