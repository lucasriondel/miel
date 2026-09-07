// The suggestions route is a thin wrapper (#160): it shape-validates the query
// and hands it to the core service. What it validates is what is asserted here —
// a request that reaches the service is a request the service can trust.
//
// The happy path is core's own suite (`promoCodes.suggestions.test.ts`), which
// runs against the in-memory stores; what a route adds is the boundary, so a
// refusal is what there is to test without a database behind it.
import { describe, expect, test } from "bun:test";
import { getEnv } from "@miel/core";
import { createApp } from "../app";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

function authGet(path: string) {
  const { API_SECRET } = getEnv();
  return createApp().fetch(
    new Request(`http://localhost${path}`, {
      headers: { Authorization: `Bearer ${API_SECRET}` },
    }),
  );
}

function authPost(path: string) {
  const { API_SECRET } = getEnv();
  return createApp().fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_SECRET}` },
    }),
  );
}

function authPatch(path: string, body: unknown) {
  const { API_SECRET } = getEnv();
  return createApp().fetch(
    new Request(`http://localhost${path}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${API_SECRET}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

function authDelete(path: string) {
  const { API_SECRET } = getEnv();
  return createApp().fetch(
    new Request(`http://localhost${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${API_SECRET}` },
    }),
  );
}

describe("GET /promo-codes", () => {
  test("refuses a request naming no account", async () => {
    const res = await authGet("/promo-codes");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "validation_failed" });
  });

  test("refuses an account that is not an id", async () => {
    const res = await authGet("/promo-codes?account=me@example.com");
    expect(res.status).toBe(400);
  });

  test("refuses a period bound that is not a datetime", async () => {
    const res = await authGet(`/promo-codes?account=${ACCOUNT}&internalDateFrom=september`);
    expect(res.status).toBe(400);
  });

  test("requires bearer auth", async () => {
    const res = await createApp().fetch(
      new Request(`http://localhost/promo-codes?account=${ACCOUNT}`),
    );
    expect(res.status).toBe(401);
  });
});

// The Promo Codes page's read (#162) takes no parameters at all — it is global
// on purpose, so there is no account to validate and nothing to refuse but a
// caller with no token. Which rows it answers, and in which of the two
// sections, is core's own suite (`promoCodes.saved.test.ts`).
describe("GET /promo-codes/saved", () => {
  test("requires bearer auth", async () => {
    const res = await createApp().fetch(new Request("http://localhost/promo-codes/saved"));
    expect(res.status).toBe(401);
  });

  // Mounted, and not the suggestions route wearing a path segment: the two
  // reads share a prefix and the suggestions one requires an `account`, so a
  // `/saved` that fell through to it would answer 400 rather than the page's
  // rows. (What it answers *with* needs a database, which this file does not
  // have — that is core's suite.)
  test("is a route of its own", async () => {
    const res = await authGet("/promo-codes/saved");
    expect([400, 404]).not.toContain(res.status);
  });
});

// Reading the mail a saved promo came from (#163). The route's own share is
// again the boundary — an id it can trust, and a token — plus the one answer it
// composes itself: a promo with no saved copy of the mail is a 404 rather than
// a null body, so a viewer never renders an empty mail as if it were the mail.
describe("GET /promo-codes/:id/original", () => {
  const PROMO = "44444444-4444-4444-8444-444444444444";

  test("refuses an id that is not one of ours", async () => {
    const res = await authGet("/promo-codes/not-a-uuid/original");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "validation_failed" });
  });

  test("requires bearer auth", async () => {
    const res = await createApp().fetch(
      new Request(`http://localhost/promo-codes/${PROMO}/original`),
    );
    expect(res.status).toBe(401);
  });

  // It reads the promo's own copy, so there is no message id in the path and
  // nothing here that could write one: the record is a record.
  test("is a read and nothing else", async () => {
    const res = await createApp().fetch(
      new Request(`http://localhost/promo-codes/${PROMO}/original`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getEnv().API_SECRET}` },
      }),
    );
    expect(res.status).toBe(404);
  });
});

// The save is the ordering rule (#161) — save, then trash — and it lives in the
// core service so the CLI and any later caller get it too. The route's own share
// is the boundary: an id it can trust, and a token.
describe("POST /promo-codes/:id/save", () => {
  const PROMO = "33333333-3333-4333-8333-333333333333";

  test("refuses an id that is not one of ours", async () => {
    const res = await authPost("/promo-codes/not-a-uuid/save");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "validation_failed" });
  });

  test("requires bearer auth", async () => {
    const res = await createApp().fetch(
      new Request(`http://localhost/promo-codes/${PROMO}/save`, { method: "POST" }),
    );
    expect(res.status).toBe(401);
  });
});

// Correcting the five guesses (#164). Which rows may be edited, and what an
// edit answers with, is core's suite (`promoCodes.edit.test.ts`); the route's
// own share is the shape it will accept — and the one refusal that is a product
// rule rather than a type check: the copy of the mail is a record, so a patch
// that names a field of it is answered rather than quietly stripped.
describe("PATCH /promo-codes/:id", () => {
  const PROMO = "55555555-5555-4555-8555-555555555555";

  test("refuses an id that is not one of ours", async () => {
    const res = await authPatch("/promo-codes/not-a-uuid", { discount: "25% off" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "validation_failed" });
  });

  // The record is not corrigible. Refused, not dropped: a caller whose patch was
  // silently ignored believes the edit landed.
  test("refuses a patch naming a field of the saved copy of the mail", async () => {
    for (const body of [
      { subject: "Something else" },
      { bodyHtml: "<p>rewritten</p>" },
      { savedAt: "2026-09-05T00:00:00.000Z" },
      { accountId: "22222222-2222-4222-8222-222222222222" },
    ]) {
      const res = await authPatch(`/promo-codes/${PROMO}`, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "validation_failed" });
    }
  });

  // The headline is what makes a row a promo at all, so it is the one field of
  // the five that cannot be emptied.
  test("refuses a discount emptied or cleared", async () => {
    expect((await authPatch(`/promo-codes/${PROMO}`, { discount: "" })).status).toBe(400);
    expect((await authPatch(`/promo-codes/${PROMO}`, { discount: null })).status).toBe(400);
  });

  // A promo expires on a date, never at an instant — the shop that said "ends
  // Sunday" meant the whole of Sunday.
  test("refuses an expiry that is not a calendar day", async () => {
    expect(
      (await authPatch(`/promo-codes/${PROMO}`, { expiresAt: "2026-10-31T12:00:00.000Z" })).status,
    ).toBe(400);
    expect((await authPatch(`/promo-codes/${PROMO}`, { expiresAt: "next Sunday" })).status).toBe(
      400,
    );
  });

  test("requires bearer auth", async () => {
    const res = await createApp().fetch(
      new Request(`http://localhost/promo-codes/${PROMO}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ discount: "25% off" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

// Removing one (#164). Nothing else on the page removes a row — an expired
// promo is kept — so this is the only door, and it is reached by asking.
describe("DELETE /promo-codes/:id", () => {
  const PROMO = "66666666-6666-4666-8666-666666666666";

  test("refuses an id that is not one of ours", async () => {
    const res = await authDelete("/promo-codes/not-a-uuid");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "validation_failed" });
  });

  test("requires bearer auth", async () => {
    const res = await createApp().fetch(
      new Request(`http://localhost/promo-codes/${PROMO}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(401);
  });
});
