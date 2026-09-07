// /settings/claude-code-token — the HTTP face of #109, plus the read-only
// status the app already asks for at /auth/claude/status.
//
// The routes own no token logic: they validate shape and delegate. What is
// asserted here is the boundary contract — a response body carries presence, a
// masked hint and which source is live, and never the token; a rejected token
// comes back as a 400 that does not echo it; and the pre-existing status route
// answers from the same place, so a stored token is not reported as "not
// configured" because the env var is unset.
//
// Only the core token functions are swapped out (the real module is loaded
// first and spread back), so the Zod schemas and the shared error handler under
// test are the real ones and no Postgres is touched.
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

const TOKEN = "sk-ant-oat01-Zx91qWertyuiop3f9";
const HINT = "sk-ant-…3f9";

type Status = { configured: boolean; hint: string | null; source: string | null };

let status: Status = { configured: false, hint: null, source: null };
let setError: unknown = null;
const setCalls: string[] = [];
let deleteCalls = 0;

const realCore = await import("@miel/core");
mock.module("@miel/core", () => ({
  ...realCore,
  getClaudeCodeTokenStatus: async () => status,
  setClaudeCodeToken: async (token: string) => {
    setCalls.push(token);
    if (setError) throw setError;
    status = { configured: true, hint: HINT, source: "stored" };
    return status;
  },
  deleteClaudeCodeToken: async () => {
    deleteCalls += 1;
    status = { configured: false, hint: null, source: null };
    return status;
  },
}));
afterAll(() => mock.restore());

const { settingsRoutes } = await import("./settings");
const { authRoutes } = await import("./auth");
const { errorHandler } = await import("../middleware/error");

const app = new Hono();
app.route("/settings", settingsRoutes);
app.route("/auth", authRoutes);
app.onError(errorHandler);

const get = (path: string) => app.fetch(new Request(`http://localhost${path}`));
const put = (path: string, body: unknown) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const del = (path: string) =>
  app.fetch(new Request(`http://localhost${path}`, { method: "DELETE" }));

afterEach(() => {
  status = { configured: false, hint: null, source: null };
  setError = null;
  setCalls.length = 0;
  deleteCalls = 0;
});

describe("GET /settings/claude-code-token", () => {
  test("reports absence with no hint and no source", async () => {
    const res = await get("/settings/claude-code-token");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: false, hint: null, source: null });
  });

  test("names the source of the active token alongside the hint", async () => {
    status = { configured: true, hint: HINT, source: "environment" };
    const res = await get("/settings/claude-code-token");
    const body = await res.text();

    expect(JSON.parse(body)).toEqual({ configured: true, hint: HINT, source: "environment" });
    expect(body).not.toContain(TOKEN);
    expect(body).not.toContain("encryptedValue");
  });
});

describe("PUT /settings/claude-code-token", () => {
  test("stores the token and answers with presence + hint + source only", async () => {
    const res = await put("/settings/claude-code-token", { token: TOKEN });

    expect(res.status).toBe(200);
    expect(setCalls).toEqual([TOKEN]);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ configured: true, hint: HINT, source: "stored" });
    expect(body).not.toContain(TOKEN);
  });

  test("rejects a blank token with a 400 that never reaches the service", async () => {
    const res = await put("/settings/claude-code-token", { token: "   " });
    expect(res.status).toBe(400);
    expect(setCalls).toEqual([]);
  });

  test("rejects a token below the minimum length at the edge", async () => {
    const res = await put("/settings/claude-code-token", { token: "sk-x" });
    expect(res.status).toBe(400);
    expect(setCalls).toEqual([]);
  });

  test("maps the service's rejection to a 400 without the token in it", async () => {
    setError = new realCore.errors.InvalidSecretError({
      name: "claude_code.oauth_token",
      reason: "too_short",
    });
    const res = await put("/settings/claude-code-token", { token: "sk-shortish" });

    expect(res.status).toBe(400);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({
      error: "invalid_secret",
      name: "claude_code.oauth_token",
      reason: "too_short",
    });
    expect(body).not.toContain("sk-shortish");
  });
});

describe("DELETE /settings/claude-code-token", () => {
  test("clears the stored token and reports what is live afterwards", async () => {
    status = { configured: true, hint: HINT, source: "stored" };
    const res = await del("/settings/claude-code-token");

    expect(res.status).toBe(200);
    expect(deleteCalls).toBe(1);
    expect(await res.json()).toEqual({ configured: false, hint: null, source: null });
  });
});

describe("GET /auth/claude/status", () => {
  // Before #109 this read the env var directly, so a token pasted in the app
  // would have shown as "not configured" here.
  test("answers from the same status as the settings route", async () => {
    status = { configured: true, hint: HINT, source: "stored" };
    const res = await get("/auth/claude/status");
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(JSON.parse(body)).toEqual({ configured: true, hint: HINT, source: "stored" });
    expect(body).not.toContain(TOKEN);
  });

  test("still reports absence when neither source has a token", async () => {
    expect(await (await get("/auth/claude/status")).json()).toEqual({
      configured: false,
      hint: null,
      source: null,
    });
  });
});
