// Verifies markStaleRunsFailed: any sync/triage row left in "running" state
// (its owning process crashed) gets flipped to "failed" so the Logs UI stops
// showing dead processes as active. Rows already in a terminal state are left
// alone.

import { afterAll, beforeAll, afterEach, describe, expect, test, mock } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

// Force a real drizzle client for this file — GoogleAuth.test globally mocks
// db/client and Bun's module mocks stick per-process.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const realDb = drizzle(sql, { schema });
mock.module("../db/client", () => ({
  getDb: () => ({ db: realDb, sql }),
  // Carried for the files loaded after this one: the mock is process-global, and
  // one importing the barrel would fail to link without every export present.
  closeDb: async () => {},
}));

import { eq } from "drizzle-orm";
import { accounts, syncWindows, triageRuns } from "../db/schema";
import { markStaleRunsFailedEffect, STALE_RUN_ERROR_MESSAGE } from "./logs";
import { runPromiseRethrow } from "../util/effect";

const EMAIL = "stale-runs-test@example.com";
let accountId: string;

describe("markStaleRunsFailed", () => {
  beforeAll(async () => {
    const [row] = await realDb
      .insert(accounts)
      .values({ email: EMAIL, refreshToken: "plain:r", scopes: [] })
      .onConflictDoUpdate({
        target: accounts.email,
        set: { refreshToken: "plain:r" },
      })
      .returning({ id: accounts.id });
    accountId = row.id;
  });

  afterEach(async () => {
    await realDb.delete(triageRuns).where(eq(triageRuns.accountId, accountId));
    await realDb.delete(syncWindows).where(eq(syncWindows.accountId, accountId));
  });

  afterAll(async () => {
    await realDb.delete(accounts).where(eq(accounts.email, EMAIL));
    await sql.end();
  });

  test("flips running sync/triage rows to failed and leaves terminal rows alone", async () => {
    const [runningSync] = await realDb
      .insert(syncWindows)
      .values({
        accountId,
        rangeFrom: new Date("2026-07-01T00:00:00Z"),
        rangeTo: new Date("2026-07-07T00:00:00Z"),
        query: "in:inbox",
        status: "running",
      })
      .returning({ id: syncWindows.id });

    const [completedSync] = await realDb
      .insert(syncWindows)
      .values({
        accountId,
        rangeFrom: new Date("2026-06-01T00:00:00Z"),
        rangeTo: new Date("2026-06-07T00:00:00Z"),
        query: "in:inbox",
        status: "completed",
        finishedAt: new Date("2026-06-07T00:05:00Z"),
      })
      .returning({ id: syncWindows.id });

    const [runningTriage] = await realDb
      .insert(triageRuns)
      .values({ accountId, status: "running", candidates: 5 })
      .returning({ id: triageRuns.id });

    const [failedTriage] = await realDb
      .insert(triageRuns)
      .values({
        accountId,
        status: "failed",
        candidates: 3,
        finishedAt: new Date("2026-06-30T00:00:00Z"),
        error: "already failed",
      })
      .returning({ id: triageRuns.id });

    const result = await runPromiseRethrow(markStaleRunsFailedEffect());
    expect(result).toEqual({ syncWindows: 1, triageRuns: 1 });

    const syncAfter = await realDb
      .select()
      .from(syncWindows)
      .where(eq(syncWindows.id, runningSync.id));
    expect(syncAfter[0].status).toBe("failed");
    expect(syncAfter[0].error).toBe(STALE_RUN_ERROR_MESSAGE);
    expect(syncAfter[0].finishedAt).not.toBeNull();

    const completedAfter = await realDb
      .select()
      .from(syncWindows)
      .where(eq(syncWindows.id, completedSync.id));
    expect(completedAfter[0].status).toBe("completed");
    expect(completedAfter[0].error).toBeNull();

    const triageAfter = await realDb
      .select()
      .from(triageRuns)
      .where(eq(triageRuns.id, runningTriage.id));
    expect(triageAfter[0].status).toBe("failed");
    expect(triageAfter[0].error).toBe(STALE_RUN_ERROR_MESSAGE);
    expect(triageAfter[0].finishedAt).not.toBeNull();

    const failedAfter = await realDb
      .select()
      .from(triageRuns)
      .where(eq(triageRuns.id, failedTriage.id));
    expect(failedAfter[0].error).toBe("already failed");
  });

  test("no-op when there are no running rows", async () => {
    const result = await runPromiseRethrow(markStaleRunsFailedEffect());
    expect(result).toEqual({ syncWindows: 0, triageRuns: 0 });
  });
});
