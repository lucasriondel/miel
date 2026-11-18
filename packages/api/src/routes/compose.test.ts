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

describe("POST /compose/uploads", () => {
  test("refuses a form with no file", async () => {
    const form = new FormData();
    form.set("accountId", ACCOUNT);
    const res = await createApp().fetch(
      new Request("http://localhost/compose/uploads", {
        method: "POST",
        headers: { Authorization: `Bearer ${getEnv().API_SECRET}` },
        body: form,
      }),
    );
    expect(res.status).toBe(400);
  });

  test("refuses an account id that is not ours", async () => {
    const form = new FormData();
    form.set("accountId", "me@example.com");
    form.set("file", new File(["x"], "a.txt", { type: "text/plain" }));
    const res = await createApp().fetch(
      new Request("http://localhost/compose/uploads", {
        method: "POST",
        headers: { Authorization: `Bearer ${getEnv().API_SECRET}` },
        body: form,
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /compose/generations/:requestId/cancel", () => {
  test("answers cancelled: false when nothing runs under that id", async () => {
    const res = await call("POST", "/compose/generations/nothing-here/cancel");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, cancelled: false });
  });
});

describe("/compose/scheduled", () => {
  const base = {
    accountId: ACCOUNT,
    kind: "new",
    sendAt: "2030-01-01T08:00:00.000Z",
    to: ["a@b.c"],
    subject: "Hi",
    body: "Hello",
  };

  test("refuses a reply that names no message", async () => {
    const res = await call("POST", "/compose/scheduled", { ...base, kind: "reply" });
    expect(res.status).toBe(400);
  });

  test("refuses a new message addressed to nobody", async () => {
    const res = await call("POST", "/compose/scheduled", { ...base, to: [] });
    expect(res.status).toBe(400);
  });

  test("refuses a time that is not an instant", async () => {
    const res = await call("POST", "/compose/scheduled", { ...base, sendAt: "monday" });
    expect(res.status).toBe(400);
  });

  test("PATCH and DELETE refuse an id that is not one", async () => {
    expect((await call("PATCH", "/compose/scheduled/x", { sendAt: base.sendAt })).status).toBe(400);
    expect((await call("DELETE", "/compose/scheduled/x")).status).toBe(400);
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
