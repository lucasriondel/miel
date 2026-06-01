// Integration test for the syncAll Claude-not-logged-in catch path. When triage
// hits a logged-out Claude CLI, syncAll should emit a single
// `sync.claude_login_required` event (login is global), stop the run, and record
// the error — mirroring the gog reauth flow in sync.reauth.test.ts.
//
// Requires a live Postgres (docker compose up -d). The eager path's login spawn
// (startClaudeLoginForEvent) is stubbed via mock.module so no real `claude auth
// login` process is launched.
// Run: bun test src/services/sync.claudeLogin.test.ts
import { afterAll, beforeEach, expect, mock, test } from "bun:test";

const CLAUDE_AUTH = `${import.meta.dir}/../adapters/claudeAuth.ts`;
const realClaudeAuth = await import(CLAUDE_AUTH);

// Track eager-spawn calls and hand back a deterministic session without spawning.
let loginSpawnCalls = 0;
mock.module(CLAUDE_AUTH, () => ({
  ...realClaudeAuth,
  startClaudeLoginForEvent: async () => {
    loginSpawnCalls += 1;
    return {
      sessionId: "stub-session",
      url: "https://claude.com/cai/oauth/authorize?stub=1",
    };
  },
}));

// Import everything that touches the stubbed module AFTER mock.module is set.
const { getDb, closeDb } = await import("../db/client");
const { accounts } = await import("../db/schema");
const { ClaudeNotLoggedInError, ShellError } = await import(
  "../adapters/shell"
);
const { syncAll } = await import("./sync");
const { inArray } = await import("drizzle-orm");

type GogAdapter = import("../adapters/gog").GogAdapter;
type ClaudeAdapter = import("../adapters/claude").ClaudeAdapter;
type SyncServerEventT = import("../schemas/syncEvents").SyncServerEventT;

// One dedicated account per test, scoped via accountEmail so each run is
// deterministic regardless of other accounts in the dev DB, and so the first
// test's fetched message can't dedupe-skip triage in the second.
const ACCT_EAGER = "claude-login-eager@example.com";
const ACCT_SIGNAL = "claude-login-signal@example.com";
const ALL_ACCTS = [ACCT_EAGER, ACCT_SIGNAL];

function notLoggedInError() {
  return new ClaudeNotLoggedInError(
    new ShellError(
      "claude is not logged in",
      1,
      "",
      JSON.stringify({ is_error: true, result: "Not logged in · Please run /login" }),
      ["claude", "-p"],
    ),
  );
}

// gog stub for a single account: returns one fetchable message so triage
// actually runs (and then hits the logged-out Claude mock).
function makeGog(account: string): GogAdapter {
  const message = {
    id: `msg-${account}`,
    threadId: `thread-${account}`,
    labelIds: ["INBOX"],
    subject: "Test subject",
    from: "sender@example.com",
    to: [account],
    snippet: "snippet",
    bodyText: "body text",
    internalDate: "1700000000000",
  };
  return {
    async listAccounts() {
      return [{ email: account, services: [], scopes: [] } as never];
    },
    async startReauth() {
      throw new Error("unexpected startReauth");
    },
    async addAccount() {
      throw new Error("unexpected addAccount");
    },
    async searchMessages() {
      return [{ messageId: message.id, threadId: message.threadId }];
    },
    async getMessage() {
      return message as never;
    },
    async listLabels() {
      return [];
    },
    async createLabel() {
      throw new Error("unexpected createLabel");
    },
    async batchModifyLabels() {},
    async trashThread() {},
    async archiveThread() {},
    async sendReply() {
      return { messageId: "x" };
    },
    async listFilters() {
      return [];
    },
    async createFilter() {
      throw new Error("unexpected createFilter");
    },
  };
}

// claude stub: every model call reports not-logged-in (the global CLI state).
const loggedOutClaude: ClaudeAdapter = {
  async runTriage() {
    throw notLoggedInError();
  },
  async generateReply() {
    throw notLoggedInError();
  },
  async runFilterSuggest() {
    throw notLoggedInError();
  },
};

beforeEach(() => {
  loginSpawnCalls = 0;
});

afterAll(async () => {
  const { db } = getDb();
  await db.delete(accounts).where(inArray(accounts.email, ALL_ACCTS));
  await closeDb();
});

test("eager: emits a single sync.claude_login_required with the stubbed session", async () => {
  const events: SyncServerEventT[] = [];

  const runs = await syncAll({
    accountEmail: ACCT_EAGER,
    gog: makeGog(ACCT_EAGER),
    claude: loggedOutClaude,
    onEvent: (e) => events.push(e),
  });

  // Exactly one login prompt for the whole run (login is global, not per-account).
  const loginEvents = events.filter(
    (e) => e.type === "sync.claude_login_required",
  );
  expect(loginEvents).toHaveLength(1);
  const login = loginEvents[0];
  if (login?.type === "sync.claude_login_required") {
    expect(login.sessionId).toBe("stub-session");
    expect(login.url).toContain("claude.com");
  }
  // The eager spawn ran exactly once.
  expect(loginSpawnCalls).toBe(1);

  // The run carries the claude_not_logged_in error.
  const run = runs.find((r) => r.account === ACCT_EAGER);
  expect(run?.errors.some((m) => m.startsWith("claude_not_logged_in"))).toBe(
    true,
  );

  // It never falsely emitted triage.finished for the cut-short account (the web
  // relies on this to dismiss the in-flight triage toast).
  expect(events.some((e) => e.type === "triage.finished")).toBe(false);
});

test("signal-only: no onEvent means no login spawn, but the error is still recorded", async () => {
  const runs = await syncAll({
    accountEmail: ACCT_SIGNAL,
    gog: makeGog(ACCT_SIGNAL),
    claude: loggedOutClaude,
  });

  expect(loginSpawnCalls).toBe(0);
  const run = runs.find((r) => r.account === ACCT_SIGNAL);
  expect(run).toBeDefined();
  expect(run?.errors.some((m) => m.startsWith("claude_not_logged_in"))).toBe(
    true,
  );
});
