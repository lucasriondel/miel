// The tagged-error → HTTP mapping, exercised through Hono's own onError path.
//
// #116: `HostedApiError` had no branch here, so a failed hosted run fell
// through to `internal_error` / 500 — and since the tag carries its reason in
// `detail` rather than `message`, the body came back with an empty message. The
// vendor's failure, already scrubbed of the key at construction, reached the
// browser as nothing at all.
//
// Nothing in here touches Postgres; the DATABASE_URL default is only so the
// core barrel imports cleanly.
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

const { errorHandler } = await import("./error");
const core = await import("@miel/core");

const raise = (err: unknown) => {
  const app = new Hono();
  app.get("/boom", () => {
    throw err;
  });
  app.onError(errorHandler);
  return app.fetch(new Request("http://localhost/boom"));
};

describe("HostedApiError", () => {
  test("maps to its own code and a gateway status, not internal_error / 500", async () => {
    const res = await raise(new core.errors.HostedApiError({ detail: "429 rate limited" }));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("hosted_api_error");
    expect(body.error).not.toBe("internal_error");
  });

  test("passes the detail through — the tag carries it in `detail`, not `message`", async () => {
    const detail =
      "No Anthropic API key is stored. Add one under Settings → AI & Triage → Credentials.";
    const res = await raise(new core.errors.HostedApiError({ detail }));

    expect((await res.json()).message).toBe(detail);
  });

  test("carries the redaction the provider applied, never the key", async () => {
    // The scrubbing happens where the key is known (the hosted transport), so what
    // arrives here is already redacted; the mapper must not undo or bypass it
    // by reaching for the original error some other way.
    const res = await raise(
      new core.errors.HostedApiError({
        detail: "Incorrect API key provided: «redacted». Check your vendor dashboard.",
      }),
    );

    const body = await res.text();
    expect(body).toContain("«redacted»");
    expect(body).not.toContain("sk-ant-");
  });
});

// #125: the same tag now arrives from two places, and they are not the same
// news. A save-time refusal is the user's edit being rejected while they are
// looking at the picker; a run-time one is an install discovering, as it tries
// to work, that it cannot — which is what a missing Claude Code token is, and
// gets that answer.
describe("ProviderNotRunnableError", () => {
  const refusal = (phase: "save" | "run") =>
    new core.errors.ProviderNotRunnableError({
      task: "triage",
      provider: "anthropic",
      reason: "missing_provider_credential",
      phase,
    });

  test("a save-time refusal keeps the 400 body the picker has always got", async () => {
    const res = await raise(refusal("save"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "missing_provider_credential",
      task: "triage",
      provider: "anthropic",
    });
  });

  test("a run-time refusal is claude_unavailable / 503", async () => {
    const res = await raise(refusal("run"));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("claude_unavailable");
    // Which task, which vendor and why — the specifics travel, so the UI can
    // say what to fix without the API inventing a sentence for it.
    expect(body).toMatchObject({
      reason: "missing_provider_credential",
      task: "triage",
      provider: "anthropic",
    });
  });

  test("a run-time model refusal names the model, and still 503", async () => {
    const res = await raise(
      new core.errors.ProviderNotRunnableError({
        task: "reply",
        provider: "openai",
        reason: "invalid_model_for_provider",
        phase: "run",
        model: "claude-opus-4-7",
      }),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "claude_unavailable",
      reason: "invalid_model_for_provider",
      task: "reply",
      provider: "openai",
      model: "claude-opus-4-7",
    });
  });
});

// #126: the middleware kept its own two-tag copy of "the provider is
// unavailable" and, like the four other copies, had never learned the third tag.
// It now asks the taxonomy, so every way to be unavailable answers the same.
describe("a provider that cannot run", () => {
  test("a missing Claude Code token is claude_unavailable / 503", async () => {
    const res = await raise(new core.errors.ClaudeTokenMissingError());

    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("claude_unavailable");
  });

  test("a token the CLI rejected is the same answer, with its detail as the message", async () => {
    const res = await raise(new core.errors.ClaudeAuthError({ detail: "invalid api key" }));

    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("claude_unavailable");
  });

  test("every tag in the shared set gets that answer when it stopped a run", async () => {
    // The set is the taxonomy's, so a fourth way to be unavailable is answered
    // here without this file — or the middleware — being edited. Only the save
    // phase, which exists on the one tag a picker can raise, answers otherwise.
    for (const tag of core.PROVIDER_UNAVAILABLE_TAGS) {
      const res = await raise(Object.assign(new Error("boom"), { _tag: tag, phase: "run" }));
      expect({ tag, status: res.status }).toEqual({ tag, status: 503 });
    }
  });
});

describe("the fallthrough", () => {
  test("still answers internal_error / 500 for an error with no branch", async () => {
    const res = await raise(new Error("something else broke"));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal_error", message: "something else broke" });
  });
});
