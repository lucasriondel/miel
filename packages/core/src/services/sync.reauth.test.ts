// Unit test for the syncAll reauth catch path (PRD Verification).
// Requires a live Postgres (docker compose up -d), matching the smoke-test
// pattern. Run with: bun test src/services/sync.reauth.test.ts
import { afterAll, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { getDb, closeDb } from "../db/client";
import { accounts } from "../db/schema";
import { ReauthRequiredError, ShellError } from "../adapters/shell";
import type { GogAdapter, ReauthSession } from "../adapters/gog";
import type { ClaudeAdapter } from "../adapters/claude";
import type { SyncServerEventT } from "../schemas/syncEvents";
import { syncAll } from "./sync";

const STALE = "reauth-test-stale@example.com";
const HEALTHY = "reauth-test-healthy@example.com";

function makeReauthError(account: string): ReauthRequiredError {
  const shell = new ShellError(
    "Command failed",
    1,
    'oauth2: "invalid_grant" "Token has been expired or revoked."',
    "",
    ["gog", "gmail", "labels", "list"],
  );
  return new ReauthRequiredError(account, shell);
}

// gog stub: both accounts exist; STALE throws ReauthRequiredError on the first
// network call (listLabels happens before anything else in fetchAndTriage),
// HEALTHY returns empty results so its sync completes cleanly.
function makeGog(opts: {
  startReauth?: GogAdapter["startReauth"];
  onStartReauth?: (account: string) => void;
}): GogAdapter {
  const base: GogAdapter = {
    async listAccounts() {
      return [
        { email: STALE, services: [], scopes: [] } as never,
        { email: HEALTHY, services: [], scopes: [] } as never,
      ];
    },
    async startReauth({ account }): Promise<ReauthSession> {
      opts.onStartReauth?.(account);
      if (opts.startReauth) return opts.startReauth({ account });
      return {
        sessionId: `session-${account}`,
        url: `https://accounts.google.com/o/oauth2/auth?account=${account}`,
        done: Promise.resolve({ ok: true } as const),
      };
    },
    async searchMessages({ account }) {
      if (account === STALE) throw makeReauthError(STALE);
      return [];
    },
    async getMessage() {
      throw new Error("unexpected getMessage");
    },
    async listLabels({ account }) {
      if (account === STALE) throw makeReauthError(STALE);
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
  return base;
}

const noopClaude: ClaudeAdapter = {
  async runTriage() {
    throw new Error("unexpected runTriage");
  },
  async generateReply() {
    throw new Error("unexpected generateReply");
  },
  async runFilterSuggest() {
    throw new Error("unexpected runFilterSuggest");
  },
} as unknown as ClaudeAdapter;

afterAll(async () => {
  const { db } = getDb();
  await db.delete(accounts).where(inArray(accounts.email, [STALE, HEALTHY]));
  await closeDb();
});

test("emits sync.reauth_required for the stale account and still syncs the healthy one", async () => {
  const events: SyncServerEventT[] = [];
  let startReauthCalls = 0;

  const gog = makeGog({ onStartReauth: () => (startReauthCalls += 1) });

  const runs = await syncAll({
    gog,
    claude: noopClaude,
    onEvent: (e) => events.push(e),
  });

  // (a) sync.reauth_required emitted for the stale account with {account, sessionId, url}
  const reauth = events.find((e) => e.type === "sync.reauth_required");
  expect(reauth).toBeDefined();
  if (reauth?.type === "sync.reauth_required") {
    expect(reauth.account).toBe(STALE);
    expect(reauth.sessionId).toBe(`session-${STALE}`);
    expect(reauth.url).toContain("accounts.google.com");
  }
  expect(startReauthCalls).toBe(1);

  // (b) the healthy account still produced a run result (continued past the stale one)
  const healthyRun = runs.find((r) => r.account === HEALTHY);
  expect(healthyRun).toBeDefined();
  expect(healthyRun?.errors.length).toBe(0);

  // The stale account also produced a run carrying the reauth error.
  const staleRun = runs.find((r) => r.account === STALE);
  expect(staleRun).toBeDefined();
  expect(staleRun?.errors.some((m) => m.startsWith("reauth_required"))).toBe(
    true,
  );
});

test("signal-only when no onEvent: no startReauth spawn, error recorded", async () => {
  let startReauthCalls = 0;
  const gog = makeGog({ onStartReauth: () => (startReauthCalls += 1) });

  // No onEvent → CLI/headless path.
  const runs = await syncAll({ gog, claude: noopClaude });

  expect(startReauthCalls).toBe(0);
  const staleRun = runs.find((r) => r.account === STALE);
  expect(staleRun).toBeDefined();
  expect(staleRun?.errors.some((m) => m.startsWith("reauth_required"))).toBe(
    true,
  );
});
