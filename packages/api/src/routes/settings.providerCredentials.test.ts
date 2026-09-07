// /settings/provider-credentials/:provider — the HTTP face of #104.
//
// The route owns no credential logic: it validates shape and delegates. What is
// asserted here is the boundary contract — a response body carries presence and
// a masked hint and never the key or its ciphertext, a rejected key comes back
// as a 400 that does not echo it, and `GET /settings` (the model picker) has not
// started returning credential rows alongside the models.
//
// The invariant that a hosted vendor is never selected without a credential
// (#117) is not the route's either any more: DELETE goes through core's checked
// facade (#124), which is faked here in its storage only — the refusal is built
// by core's real kernel, whose matrix lives in that package's tests.
//
// Only the core credential functions are swapped out (the real module is loaded
// first and spread back), so the Zod schemas and the shared error handler under
// test are the real ones and no Postgres is touched.
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
// Types only, so importing them does not load the real barrel ahead of the mock.
import type { CredentialProvider, ModelSettings } from "@miel/core";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

const KEY = "sk-ant-api03-Zx91qWertyuiop3f9";
const HINT = "sk-ant-…3f9";

let stored: { configured: boolean; hint: string | null } = { configured: false, hint: null };
let setError: unknown = null;
const setCalls: Array<{ provider: string; apiKey: string }> = [];
const deleteCalls: string[] = [];
const MODEL_SETTINGS = {
  triageModel: "claude-haiku-4-5",
  triageProvider: "anthropic",
  replyModel: "claude-sonnet-4-6",
  replyProvider: "claude-code",
  filterModel: "claude-haiku-4-5",
  filterProvider: "claude-code",
};
// Which vendor each task runs on decides whether its key may be deleted
// (#117), so this is per-test rather than frozen.
let modelSettings: Record<string, string> = { ...MODEL_SETTINGS };

const realCore = await import("@miel/core");
mock.module("@miel/core", () => ({
  ...realCore,
  getModelSettings: async () => modelSettings,
  getProviderCredentialStatus: async (provider: string) => ({ provider, ...stored }),
  setProviderCredential: async (provider: string, apiKey: string) => {
    setCalls.push({ provider, apiKey });
    if (setError) throw setError;
    stored = { configured: true, hint: HINT };
    return { provider, ...stored };
  },
  checkedDeleteProviderCredential: async (provider: CredentialProvider) => {
    const rejection = realCore.rejectCredentialDeletion(
      provider,
      modelSettings as unknown as ModelSettings,
    );
    if (rejection) throw rejection;
    deleteCalls.push(provider);
    stored = { configured: false, hint: null };
    return { provider, configured: false, hint: null };
  },
}));
afterAll(() => mock.restore());

const { settingsRoutes } = await import("./settings");
const { errorHandler } = await import("../middleware/error");

const app = new Hono();
app.route("/settings", settingsRoutes);
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
  stored = { configured: false, hint: null };
  setError = null;
  setCalls.length = 0;
  deleteCalls.length = 0;
  modelSettings = { ...MODEL_SETTINGS };
});

describe("GET /settings/provider-credentials/:provider", () => {
  test("reports absence with no hint", async () => {
    const res = await get("/settings/provider-credentials/anthropic");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ provider: "anthropic", configured: false, hint: null });
  });

  test("reports presence with a masked hint and nothing else", async () => {
    stored = { configured: true, hint: HINT };
    const res = await get("/settings/provider-credentials/anthropic");
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ provider: "anthropic", configured: true, hint: HINT });
    expect(body).not.toContain(KEY);
    expect(body).not.toContain("encryptedKey");
  });

  test("serves a route for every vendor a task can be pointed at (#105)", async () => {
    for (const provider of realCore.CREDENTIAL_PROVIDERS) {
      const res = await get(`/settings/provider-credentials/${provider}`);
      expect(res.status).toBe(200);
      expect((await res.json()).provider).toBe(provider);
    }
  });

  test("rejects an unknown provider with a 400", async () => {
    const res = await get("/settings/provider-credentials/mistral");
    expect(res.status).toBe(400);
  });
});

describe("PUT /settings/provider-credentials/:provider", () => {
  test("stores the key and answers with presence + hint only", async () => {
    const res = await put("/settings/provider-credentials/anthropic", { apiKey: KEY });

    expect(res.status).toBe(200);
    expect(setCalls).toEqual([{ provider: "anthropic", apiKey: KEY }]);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ provider: "anthropic", configured: true, hint: HINT });
    expect(body).not.toContain(KEY);
  });

  test("rejects a blank key with a 400 that does not echo the body", async () => {
    const res = await put("/settings/provider-credentials/anthropic", { apiKey: "  " });
    expect(res.status).toBe(400);
    expect(setCalls).toEqual([]);
  });

  test("maps the service's rejection to a 400 without the key in it", async () => {
    setError = new realCore.errors.InvalidProviderCredentialError({
      provider: "anthropic",
      reason: "too_short",
    });
    const res = await put("/settings/provider-credentials/anthropic", { apiKey: "sk-shortish" });

    expect(res.status).toBe(400);
    const body = await res.text();
    expect(JSON.parse(body).error).toBe("invalid_provider_credential");
    expect(body).not.toContain("sk-shortish");
  });

  test("rejects an unknown provider with a 400", async () => {
    const res = await put("/settings/provider-credentials/mistral", { apiKey: KEY });
    expect(res.status).toBe(400);
    expect(setCalls).toEqual([]);
  });
});

describe("DELETE /settings/provider-credentials/:provider", () => {
  test("clears the credential of a vendor no task is pointed at", async () => {
    stored = { configured: true, hint: HINT };
    const res = await del("/settings/provider-credentials/google");

    expect(res.status).toBe(200);
    expect(deleteCalls).toEqual(["google"]);
    expect(await res.json()).toEqual({ provider: "google", configured: false, hint: null });
  });

  // The other way into the state PUT /settings exists to prevent: the key of
  // the vendor triage is presently running on, gone, and the failure deferred
  // to the next sync (#117).
  test("refuses to clear the key of the vendor a task is pointed at", async () => {
    stored = { configured: true, hint: HINT };
    const res = await del("/settings/provider-credentials/anthropic");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_provider_credential");
    expect(body.provider).toBe("anthropic");
    expect(body.task).toBe("triage");
    // Refused before anything is dropped.
    expect(deleteCalls).toEqual([]);
  });

  // Which task the refusal names, and the rest of the matrix, is core's test
  // now (#124) — this suite keeps the two ends of the route: it refuses, and it
  // still clears once the pairing is gone.
  test("clears the key again once the task has been moved off that vendor", async () => {
    modelSettings = { ...MODEL_SETTINGS, triageProvider: "claude-code" };
    stored = { configured: true, hint: HINT };

    const res = await del("/settings/provider-credentials/anthropic");

    expect(res.status).toBe(200);
    expect(deleteCalls).toEqual(["anthropic"]);
  });

  test("does not leak the key it declined to delete", async () => {
    stored = { configured: true, hint: HINT };
    const body = await (await del("/settings/provider-credentials/anthropic")).text();

    expect(body).not.toContain(KEY);
    expect(body).not.toContain(HINT);
  });
});

describe("GET /settings", () => {
  test("still returns only the model picker — no credential fields", async () => {
    stored = { configured: true, hint: HINT };
    const res = await get("/settings");
    const body = await res.text();

    expect(JSON.parse(body)).toEqual(modelSettings);
    expect(body).not.toContain("hint");
    expect(body).not.toContain("configured");
    expect(body).not.toContain(KEY);
  });
});
