// Verifies syncAll's error→event mapping (the paths that replaced the deleted
// reauth/claudeLogin tests):
//   - a revoked/missing Google grant  → sync.reconnect_required (per account)
//   - a missing/invalid Claude token   → sync.provider_unavailable
// DB-backed: syncAll reads connected accounts from the DB, so we insert one,
// then inject fake Gmail/Claude layers that throw the relevant tagged errors.

import { afterAll, beforeAll, describe, expect, test, mock } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

// Other test files (GoogleAuth.test) globally mock ../../db/client, and Bun's
// module mocks are sticky per-process with last-write-wins. This test needs a
// REAL db, so we install our own getDb that builds a fresh drizzle client
// directly from DATABASE_URL (bypassing any leaked fake). Installed here so it
// wins for this file.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const realDb = drizzle(sql, { schema });
mock.module("../../db/client", () => ({
  getDb: () => ({ db: realDb, sql }),
  // Carried for the files loaded after this one: the mock is process-global, and
  // one importing the barrel would fail to link without every export present.
  closeDb: async () => {},
}));

import { Effect, Layer } from "effect";
import { eq } from "drizzle-orm";

function getDb() {
  return { db: realDb, sql };
}
import { accounts } from "../../db/schema";
import { TokenRefreshError, ClaudeTokenMissingError, ProviderNotRunnableError } from "../../errors";
import { GmailService } from "./services";
import { syncAllEffect } from "./syncAll";
import type { GmailDataAdapter } from "../../google/gmailAdapter";
import { Claude, type ClaudeImpl } from "../../claude/Claude";
import type { SyncServerEventT } from "../../schemas/syncEvents";
import { runPromiseRethrow } from "../../util/effect";
import { makeTestStores } from "../../testkit/stores";
import { claudeThatFails } from "../../testkit/claude";

const EMAIL = "sync-events-test@example.com";

// A Gmail adapter whose first sync call (listLabels) fails with the grant error.
function gmailThatFailsAuth(): GmailDataAdapter {
  const fail = async (): Promise<never> => {
    throw new TokenRefreshError({ ref: `email:${EMAIL}`, cause: "invalid_grant" });
  };
  return {
    searchMessages: fail,
    getMessage: fail,
    listLabels: fail,
    createLabel: fail,
    batchModifyLabels: async () => {},
    trashThread: async () => {},
    archiveThread: async () => {},
    sendReply: async () => ({ messageId: "x" }),
    listFilters: fail,
    createFilter: fail,
    deleteFilter: fail,
    getAttachment: fail,
  };
}

// A Gmail adapter that succeeds at the read steps so the run reaches triage.
function gmailOk(): GmailDataAdapter {
  return {
    searchMessages: async () => [],
    getMessage: async () => {
      throw new Error("unused");
    },
    listLabels: async () => [],
    createLabel: async () => {
      throw new Error("unused");
    },
    batchModifyLabels: async () => {},
    trashThread: async () => {},
    archiveThread: async () => {},
    sendReply: async () => ({ messageId: "x" }),
    listFilters: async () => [],
    createFilter: async () => {
      throw new Error("unused");
    },
    deleteFilter: async () => {
      throw new Error("unused");
    },
    getAttachment: async () => {
      throw new Error("unused");
    },
  };
}

/**
 * `gmailOk`, plus one message for triage to have something to run on.
 *
 * The id is a parameter because these runs share an account and a database:
 * the fetch step dedupes against what is already stored, so two tests handing
 * out the same id means the second one triages nothing at all.
 */
function gmailWithMessage(id: string): GmailDataAdapter {
  const gmail = gmailOk();
  gmail.searchMessages = async () => [{ messageId: id, threadId: `t-${id}` }];
  gmail.getMessage = async () => ({
    id,
    threadId: `t-${id}`,
    labelIds: ["INBOX"],
    snippet: "s",
    internalDate: "1700000000000",
    payload: {
      headers: [
        { name: "Subject", value: "hi" },
        { name: "From", value: "a@b.c" },
      ],
      body: { data: "" },
    },
  });
  return gmail;
}

function claudeMissingToken(): ClaudeImpl {
  return claudeThatFails(new ClaudeTokenMissingError());
}

// A hosted vendor the install has no key for: the resolver refuses the task
// before a socket is opened (#125), which is what the seam surfaces here.
function claudeKeylessHostedProvider(): ClaudeImpl {
  return claudeThatFails(
    new ProviderNotRunnableError({
      task: "triage",
      provider: "anthropic",
      reason: "missing_provider_credential",
      phase: "run",
    }),
  );
}

const collectEvents = (gmail: GmailDataAdapter, claude: ClaudeImpl) => {
  const events: SyncServerEventT[] = [];
  // The triage phase reads the batch settings, and this suite is about error
  // mapping rather than about what those settings are: an empty in-memory
  // settings store (#132) answers them as their defaults without a row.
  const layer = Layer.mergeAll(
    Layer.succeed(GmailService, GmailService.make(gmail)),
    // The one seam (#133): the fake is the Claude interface itself.
    Layer.succeed(Claude, claude),
    makeTestStores().layer,
  );
  return runPromiseRethrow(
    syncAllEffect({
      accountEmail: EMAIL,
      onEvent: (e) => events.push(e),
    }).pipe(Effect.provide(layer)),
  ).then((runs) => ({ runs, events }));
};

describe("syncAll error → event mapping", () => {
  beforeAll(async () => {
    const { db } = getDb();
    await db
      .insert(accounts)
      .values({ email: EMAIL, refreshToken: "plain:r", scopes: [] })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await realDb.delete(accounts).where(eq(accounts.email, EMAIL));
    await sql.end();
  });

  test("a revoked grant emits sync.reconnect_required for the account", async () => {
    const { runs, events } = await collectEvents(gmailThatFailsAuth(), claudeMissingToken());
    const reconnect = events.find((e) => e.type === "sync.reconnect_required");
    expect(reconnect).toBeDefined();
    if (reconnect?.type === "sync.reconnect_required") {
      expect(reconnect.account).toBe(EMAIL);
    }
    // The run is recorded as a failure for that account, not a thrown defect.
    expect(runs.some((r) => r.account === EMAIL)).toBe(true);
  });

  test("a missing Claude token emits sync.provider_unavailable", async () => {
    // Gmail reads succeed (empty inbox) but triage would run — except there are
    // no messages, so triage is skipped. Force a message so triage is reached:
    const gmail = gmailWithMessage("m1");

    const { events } = await collectEvents(gmail, claudeMissingToken());
    const claudeEvent = events.find((e) => e.type === "sync.provider_unavailable");
    expect(claudeEvent).toBeDefined();
    if (claudeEvent?.type === "sync.provider_unavailable") {
      expect(claudeEvent.reason).toBe("ClaudeTokenMissingError");
    }
  });

  // #126: the same condition, reached the other way. A task pointed at a hosted
  // vendor with no stored key used to be swallowed batch by batch — the run
  // reported "N failed batches", no event fired, and the user was told nothing.
  test("a keyless hosted provider emits it too, and records one failed run", async () => {
    // A message id of its own, and this is load-bearing: the run above stored
    // `m1` for this account, and the fetch step skips a message it already has.
    // Reusing the id left this test with nothing to triage, so Claude was never
    // called and the assertion below was checking that a run which never
    // reached the provider did not report one.
    const gmail = gmailWithMessage("m2");

    const { runs, events } = await collectEvents(gmail, claudeKeylessHostedProvider());

    const claudeEvent = events.find((e) => e.type === "sync.provider_unavailable");
    expect(claudeEvent).toBeDefined();
    if (claudeEvent?.type === "sync.provider_unavailable") {
      expect(claudeEvent.reason).toBe("ProviderNotRunnableError");
    }
    // One failed run for the account, not a batch tally — and the error names
    // the condition rather than being an empty `provider_unavailable:`.
    expect(runs).toHaveLength(1);
    expect(runs[0].account).toBe(EMAIL);
    expect(runs[0].errors[0]).toContain("provider_unavailable");
    expect(runs[0].errors[0]).toContain("ProviderNotRunnableError");
    expect(runs[0].triaged).toBe(0);
    // The batch-level "failed" progress events are the shape the bug produced:
    // every batch burned, the run reported as finished-with-failures.
    expect(events.some((e) => e.type === "triage.finished")).toBe(false);
  });
});
