// PUT /settings/worp — the HTTP face of worp's runtime configuration (#107).
//
// The route owns no worp logic: it validates shape and delegates. What is
// asserted here is the boundary contract this package is responsible for — a key
// too short to be a credential is refused at the edge and never reaches the
// service (#118), the empty string still reaches it because that is how the key
// is cleared, and a rejection from the service arrives as a 400 naming the field
// without echoing the key.
//
// Only the two core worp functions are swapped out (the real module is loaded
// first and spread back), so the Zod schemas and the shared error handler under
// test are the real ones and no Postgres is touched.
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

const KEY = "worp_live_Zx91qWertyuiop3f9";
const HINT = "worp_li…3f9";

type Patch = { baseUrl?: string; apiKey?: string | null; extraHeaders?: Record<string, unknown> };

let settings = {
  baseUrl: "",
  apiKey: { configured: false, hint: null as string | null },
  extraHeaders: [] as { name: string; valueHint: string }[],
  configured: false,
};
let updateError: unknown = null;
const updateCalls: Patch[] = [];

const realCore = await import("@miel/core");
mock.module("@miel/core", () => ({
  ...realCore,
  getWorpSettings: async () => settings,
  updateWorpSettings: async (patch: Patch) => {
    updateCalls.push(patch);
    if (updateError) throw updateError;
    if (typeof patch.apiKey === "string" && patch.apiKey.length > 0) {
      settings = { ...settings, apiKey: { configured: true, hint: HINT } };
    }
    if (patch.apiKey === null || patch.apiKey === "") {
      settings = { ...settings, apiKey: { configured: false, hint: null } };
    }
    return settings;
  },
}));
afterAll(() => mock.restore());

const { settingsRoutes } = await import("./settings");
const { errorHandler } = await import("../middleware/error");
const { MIN_KEY_LENGTH } = await import("@miel/core/credentialMasking");

const app = new Hono();
app.route("/settings", settingsRoutes);
app.onError(errorHandler);

const put = (body: unknown) =>
  app.fetch(
    new Request("http://localhost/settings/worp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

afterEach(() => {
  settings = {
    baseUrl: "",
    apiKey: { configured: false, hint: null },
    extraHeaders: [],
    configured: false,
  };
  updateError = null;
  updateCalls.length = 0;
});

describe("PUT /settings/worp — the key's minimum length", () => {
  test("stores a real key and answers with presence + hint only", async () => {
    const res = await put({ apiKey: KEY });

    expect(res.status).toBe(200);
    expect(updateCalls).toEqual([{ apiKey: KEY }]);
    const body = await res.text();
    expect(JSON.parse(body).apiKey).toEqual({ configured: true, hint: HINT });
    expect(body).not.toContain(KEY);
  });

  // The bug (#118): this saved cleanly, and the next GET reported worp
  // configured on a key that could only ever fail at the relay.
  test("refuses a one-character key at the edge, before the service sees it", async () => {
    const res = await put({ apiKey: "x" });

    expect(res.status).toBe(400);
    expect(updateCalls).toEqual([]);
    expect((await res.json()).error).toBe("validation_failed");
  });

  test("refuses anything below the shared minimum and accepts it at the minimum", async () => {
    const short = await put({ apiKey: "wk-".padEnd(MIN_KEY_LENGTH - 1, "9") });
    expect(short.status).toBe(400);
    expect(updateCalls).toEqual([]);

    const shortest = await put({ apiKey: "wk-".padEnd(MIN_KEY_LENGTH, "9") });
    expect(shortest.status).toBe(200);
  });

  test("refuses a key that is only long enough with its whitespace", async () => {
    const res = await put({ apiKey: `   ${"wk-".padEnd(MIN_KEY_LENGTH - 1, "9")}   ` });
    expect(res.status).toBe(400);
    expect(updateCalls).toEqual([]);
  });

  // Clearing is not a short key: both spellings of "remove it" must go through.
  test("an empty key still reaches the service, since that is how it is cleared", async () => {
    settings = { ...settings, apiKey: { configured: true, hint: HINT } };
    const res = await put({ apiKey: "" });

    expect(res.status).toBe(200);
    expect(updateCalls).toEqual([{ apiKey: "" }]);
    expect((await res.json()).apiKey).toEqual({ configured: false, hint: null });
  });

  test("a null key still clears", async () => {
    settings = { ...settings, apiKey: { configured: true, hint: HINT } };
    const res = await put({ apiKey: null });

    expect(res.status).toBe(200);
    expect(updateCalls).toEqual([{ apiKey: null }]);
    expect((await res.json()).apiKey).toEqual({ configured: false, hint: null });
  });

  test("a patch that does not mention the key is unaffected", async () => {
    const res = await put({ baseUrl: "https://worp.example.com" });
    expect(res.status).toBe(200);
    expect(updateCalls).toEqual([{ baseUrl: "https://worp.example.com" }]);
  });

  // The service checks too, for callers that do not come through this schema —
  // and its refusal has to arrive as a 400 naming the field, not a 500.
  test("maps the service's rejection to a 400 that names the field", async () => {
    updateError = new realCore.errors.InvalidWorpSettingsError({
      field: "apiKey",
      reason: "too_short",
    });
    const res = await put({ apiKey: "wk-shortish" });

    expect(res.status).toBe(400);
    const body = await res.text();
    expect(JSON.parse(body)).toMatchObject({
      error: "invalid_worp_settings",
      field: "apiKey",
      reason: "too_short",
    });
    expect(body).not.toContain("wk-shortish");
  });
});
