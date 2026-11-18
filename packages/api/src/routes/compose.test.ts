// The compose routes are thin wrappers: they shape-validate and delegate. The
// behaviour is core's (`services/reply.test.ts`, `services/drafts.test.ts`),
// against the in-memory stores; what a route adds is the boundary, so the
// refusals — which never reach a service, a database or Gmail — are what is
// asserted here, plus the authenticated ping.
import { describe, expect, test } from "bun:test";
import { getEnv } from "@miel/core";
import { createApp } from "../app";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

function call(method: string, path: string, body?: unknown, secret = getEnv().API_SECRET) {
  return createApp().fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

describe("POST /compose/send", () => {
  test("refuses a message addressed to nobody", async () => {
    const res = await call("POST", "/compose/send", {
      accountId: ACCOUNT,
      to: [],
      subject: "Hi",
      body: "Hello",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("validation_failed");
  });

  test("refuses an account that is not one of ours", async () => {
    const res = await call("POST", "/compose/send", {
      accountId: "me@example.com",
      to: ["a@b.c"],
      subject: "Hi",
      body: "Hello",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /compose/generate", () => {
  test("refuses a request with no instruction", async () => {
    const res = await call("POST", "/compose/generate", { accountId: ACCOUNT, prompt: "" });
    expect(res.status).toBe(400);
  });
});

describe("/compose/drafts", () => {
  test("PUT refuses a draft naming no account", async () => {
    const res = await call("PUT", "/compose/drafts", { body: "half a thought" });
    expect(res.status).toBe(400);
  });

  test("DELETE refuses an account id that is not ours", async () => {
    const res = await call("DELETE", "/compose/drafts/not-a-uuid/r-123");
    expect(res.status).toBe(400);
  });
});

describe("GET /auth/check", () => {
  test("answers ok with the right secret", async () => {
    const res = await call("GET", "/auth/check");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("answers 401 with a wrong one, which is what tells the two apart", async () => {
    const res = await call("GET", "/auth/check", undefined, "not-the-secret");
    expect(res.status).toBe(401);
  });
});
