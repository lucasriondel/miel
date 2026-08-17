// What a caller is told when an AI task cannot run (#125).
//
// Before, the two conditions were indistinguishable at the boundary: a hosted
// vendor with no stored key was discovered *inside* the transport and dressed
// as a `HostedApiError`, so "you have not pasted a credential" and "the vendor
// rejected the call" both came back as a 502 with prose in the message. The
// provider is resolved before the transport now, so the first is a
// `ProviderNotRunnableError` and answers 503 `claude_unavailable` — the family
// a missing Claude Code token is already in — while the second is untouched.
//
// The reply route is the one exercised here because it is the one a user
// watches happen; the mapping itself is the middleware's and is asserted in
// `middleware/error.test.ts`. Nothing here touches Postgres: the core service
// is faked, and `DATABASE_URL` is only so the barrel imports cleanly.
import { afterAll, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

const realCore = await import("@miel/core");

/** What the faked core service does when the route calls it. */
let generateReply: () => unknown = () => {
  throw new Error("no outcome set");
};

mock.module("@miel/core", () => ({
  ...realCore,
  generateReply: async () => generateReply(),
}));
afterAll(() => mock.restore());

const { messagesRoutes } = await import("./messages");
const { errorHandler } = await import("../middleware/error");

const app = new Hono();
app.route("/messages", messagesRoutes);
app.onError(errorHandler);

const post = () =>
  app.fetch(
    new Request("http://localhost/messages/acc-1/msg-1/generate-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "decline politely" }),
    }),
  );

describe("POST /messages/:accountId/:gmailMessageId/generate-reply", () => {
  test("answers 503 claude_unavailable when the task's provider cannot run", async () => {
    generateReply = () => {
      throw new realCore.errors.ProviderNotRunnableError({
        task: "reply",
        provider: "openai",
        reason: "missing_provider_credential",
        phase: "run",
      });
    };

    const res = await post();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("claude_unavailable");
    expect(body).toMatchObject({ reason: "missing_provider_credential", provider: "openai" });
  });

  test("that answer carries no key, no hint and no prose about Settings", async () => {
    generateReply = () => {
      throw new realCore.errors.ProviderNotRunnableError({
        task: "reply",
        provider: "anthropic",
        reason: "missing_provider_credential",
        phase: "run",
      });
    };

    const body = await (await post()).text();

    expect(body).not.toContain("sk-ant-");
    expect(body).not.toContain("hint");
    // The sentence that sends a user to Settings is the UI's, so that the same
    // failure can read differently in a toast, in the composer and in a log.
    expect(body).not.toContain("Settings");
  });

  test("a genuine vendor failure still answers 502 with its scrubbed detail", async () => {
    generateReply = () => {
      throw new realCore.errors.HostedApiError({
        detail: "429 quota exceeded for key «redacted»",
      });
    };

    const res = await post();

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "hosted_api_error",
      message: "429 quota exceeded for key «redacted»",
    });
  });
});
