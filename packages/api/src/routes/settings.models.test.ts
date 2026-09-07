// PUT /settings and DELETE /settings/provider-credentials/:provider — the HTTP
// face of the provider doors (#105, #117, #124).
//
// Since #124 the rule itself is core's: `services/taskProviders.ts` owns which
// combinations may be saved, and `packages/core/src/services/taskProviders*.test.ts`
// owns the refusal matrix — with no database and no mocked route. What is left
// here is what only the HTTP layer can get wrong:
//
//   - mapping: a `ProviderNotRunnableError` becomes the same 400 body the two
//     inline guards used to write, byte-for-byte;
//   - atomic refusal: a refused patch reaches no writer at all, and the route
//     has no second, unchecked way to write one;
//   - no key leak: a refusal names a task and a vendor and no part of a key.
//
// The checked facades are faked here, but only their *storage* — the rejection
// the route maps is built by core's real kernel, so a body asserted below is one
// the real checker can produce.
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
// Types only, so importing them does not load the real barrel ahead of the mock.
import type { CredentialProvider, ModelSettings } from "@miel/core";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

const DEFAULTS: ModelSettings = {
  triageModel: "claude-haiku-4-5",
  triageProvider: "claude-code",
  replyModel: "claude-sonnet-4-6",
  replyProvider: "claude-code",
  filterModel: "claude-haiku-4-5",
  filterProvider: "claude-code",
  // The fourth task (#156). No route names it yet — it is here because the
  // settings the route hands back are every task's, not the three it edits.
  "promo-extractModel": "claude-haiku-4-5",
  "promo-extractProvider": "claude-code",
};
const HINT = "sk-ant-…3f9";
const KEY = "sk-ant-api03-Zx91qWertyuiop3f9";

let current = { ...DEFAULTS };
let configured: Record<string, boolean> = {};
// Writes that went through the checked facade, and writes that did not — the
// second list is the one that must stay empty whatever the request.
let updates: Array<Record<string, unknown>> = [];
let uncheckedWrites: Array<Record<string, unknown>> = [];
let deletes: string[] = [];
let uncheckedDeletes: string[] = [];

const realCore = await import("@miel/core");
const configuredSet = (): ReadonlySet<CredentialProvider> =>
  new Set(realCore.CREDENTIAL_PROVIDERS.filter((provider) => configured[provider] === true));

mock.module("@miel/core", () => ({
  ...realCore,
  getModelSettings: async () => current,
  checkedUpdateModelSettings: async (patch: Partial<ModelSettings>) => {
    const rejection = realCore.rejectModelPatch(patch, current, configuredSet());
    if (rejection) throw rejection;
    updates.push(patch);
    current = { ...current, ...patch };
    return current;
  },
  checkedDeleteProviderCredential: async (provider: CredentialProvider) => {
    const rejection = realCore.rejectCredentialDeletion(provider, current);
    if (rejection) throw rejection;
    deletes.push(provider);
    delete configured[provider];
    return { provider, configured: false, hint: null };
  },
  // The unchecked writers the route must not reach for. Recorded rather than
  // removed, so a route that starts calling one fails here instead of silently
  // walking past the rule.
  updateModelSettings: async (patch: Record<string, unknown>) => {
    uncheckedWrites.push(patch);
    return current;
  },
  deleteProviderCredential: async (provider: string) => {
    uncheckedDeletes.push(provider);
    return { provider, configured: false, hint: null };
  },
  getProviderCredentialStatus: async (provider: string) => ({
    provider,
    configured: configured[provider] === true,
    hint: configured[provider] === true ? HINT : null,
  }),
}));
afterAll(() => mock.restore());

const { settingsRoutes } = await import("./settings");
const { errorHandler } = await import("../middleware/error");

const app = new Hono();
app.route("/settings", settingsRoutes);
app.onError(errorHandler);

const put = (body: unknown) =>
  app.fetch(
    new Request("http://localhost/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const del = (path: string) =>
  app.fetch(new Request(`http://localhost${path}`, { method: "DELETE" }));

beforeEach(() => {
  current = { ...DEFAULTS };
  configured = {};
  updates = [];
  uncheckedWrites = [];
  deletes = [];
  uncheckedDeletes = [];
});

describe("PUT /settings hands the patch to the checked facade", () => {
  test("saves a runnable patch and answers with the settings", async () => {
    configured = { anthropic: true };

    const res = await put({ triageProvider: "anthropic", triageModel: "claude-sonnet-4-6" });

    expect(res.status).toBe(200);
    expect(updates).toEqual([{ triageProvider: "anthropic", triageModel: "claude-sonnet-4-6" }]);
    expect(uncheckedWrites).toEqual([]);
    expect((await res.json()).triageProvider).toBe("anthropic");
  });

  // Issue #154. The fourth task runs on every sync since #159, and the route's
  // schema named three: a patch pointing it at a vendor parsed cleanly with the
  // field stripped, so the answer was a 200 and the settings unchanged. An
  // install whose other tasks all run on a vendor was left extracting promos
  // through the local CLI, with no way to say otherwise and a sync that stops
  // when that CLI has no token.
  test("saves the fourth task the same way, hyphen and all", async () => {
    configured = { openai: true };

    const res = await put({ "promo-extractProvider": "openai", "promo-extractModel": "gpt-4.1" });

    expect(res.status).toBe(200);
    expect(updates).toEqual([
      { "promo-extractProvider": "openai", "promo-extractModel": "gpt-4.1" },
    ]);
    expect((await res.json())["promo-extractProvider"]).toBe("openai");
  });
});

describe("the 400 bodies the guards used to write", () => {
  test("a vendor with no stored key maps to missing_provider_credential", async () => {
    const res = await put({ triageProvider: "anthropic" });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: "missing_provider_credential",
      task: "triage",
      provider: "anthropic",
    });
    // No `model` key on this reason — it was absent from the guard's body too.
    expect(Object.keys(body)).not.toContain("model");
  });

  // The credential rule is the kernel's and covers every task in the catalogue,
  // so the fourth one is refused like the first — which is only true once the
  // route stops stripping it on the way in.
  test("the fourth task's vendor is checked for a key like any other", async () => {
    const res = await put({ "promo-extractProvider": "google" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "missing_provider_credential",
      task: "promo-extract",
      provider: "google",
    });
    expect(updates).toEqual([]);
  });

  test("a model the vendor does not serve maps to invalid_model_for_provider", async () => {
    configured = { google: true };

    const res = await put({ triageProvider: "google", triageModel: "gpt-4.1" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid_model_for_provider",
      task: "triage",
      provider: "google",
      model: "gpt-4.1",
    });
  });

  test("a refused credential deletion maps to the same body as the save", async () => {
    current = { ...DEFAULTS, replyProvider: "openai", replyModel: "gpt-4.1-mini" };
    configured = { openai: true };

    const res = await del("/settings/provider-credentials/openai");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "missing_provider_credential",
      task: "reply",
      provider: "openai",
    });
  });
});

describe("a refusal reaches no writer", () => {
  test("a two-task patch with one bad half writes neither", async () => {
    configured = { anthropic: true };

    const res = await put({ triageProvider: "anthropic", replyProvider: "openai" });

    expect(res.status).toBe(400);
    expect((await res.json()).provider).toBe("openai");
    expect(updates).toEqual([]);
    expect(uncheckedWrites).toEqual([]);
    expect(current).toEqual(DEFAULTS);
  });

  test("a refused deletion drops nothing", async () => {
    current = { ...DEFAULTS, triageProvider: "anthropic" };
    configured = { anthropic: true };

    expect((await del("/settings/provider-credentials/anthropic")).status).toBe(400);
    expect(deletes).toEqual([]);
    expect(uncheckedDeletes).toEqual([]);
    expect(configured.anthropic).toBe(true);
  });

  test("the deletion still goes through once no task points at that vendor", async () => {
    configured = { anthropic: true };

    const res = await del("/settings/provider-credentials/anthropic");

    expect(res.status).toBe(200);
    expect(deletes).toEqual(["anthropic"]);
    expect(uncheckedDeletes).toEqual([]);
  });
});

describe("a refusal carries no part of a key", () => {
  test("neither the key nor its masked hint is in either refusal body", async () => {
    current = { ...DEFAULTS, triageProvider: "anthropic" };
    configured = { anthropic: true };

    const bodies = [
      await (await del("/settings/provider-credentials/anthropic")).text(),
      // Same pairing, key gone out of band (an older build, a hand-run DELETE).
      await (async () => {
        configured = {};
        return (await put({ triageModel: "claude-sonnet-4-6" })).text();
      })(),
    ];

    for (const body of bodies) {
      expect(body).not.toContain(KEY);
      expect(body).not.toContain(HINT);
      expect(body).not.toContain("hint");
    }
  });
});

describe("GET /settings", () => {
  test("answers with the stored picker as-is", async () => {
    const res = await app.fetch(new Request("http://localhost/settings"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DEFAULTS);
  });
});
