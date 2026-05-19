import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "../env";
import * as schema from "./schema";

let cachedSql: ReturnType<typeof postgres> | null = null;
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (cachedDb && cachedSql) return { db: cachedDb, sql: cachedSql };
  const { DATABASE_URL } = getEnv();
  cachedSql = postgres(DATABASE_URL);
  cachedDb = drizzle(cachedSql, { schema });
  return { db: cachedDb, sql: cachedSql };
}

export type Db = ReturnType<typeof getDb>["db"];
