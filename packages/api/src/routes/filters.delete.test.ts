// DELETE /filters/:gmailFilterId — the route validates its input with Zod and
// delegates to the core service; it owns no filter logic of its own.
//
// Only `deleteFilterForAccount` is swapped out (the real module is loaded first
// and spread back), so the Zod schema and the shared error handler under test
// are the real ones and no Postgres or Gmail call is made.
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

let deleteResult: unknown = null;
let deleteError: Error | null = null;
const deleteCalls: unknown[] = [];

const realCore = await import("@miel/core");
mock.module("@miel/core", () => ({
  ...realCore,
  deleteFilterForAccount: async (args: unknown) => {
    deleteCalls.push(args);
    if (deleteError) throw deleteError;
    return deleteResult;
  },
}));
afterAll(() => mock.restore());

const { filtersRoutes } = await import("./filters");
const { errorHandler } = await import("../middleware/error");

const app = new Hono();
app.route("/filters", filtersRoutes);
app.onError(errorHandler);

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const FILTER = {
  id: "row-1",
  accountId: ACCOUNT,
  gmailFilterId: "gmail-filter-1",
  criteria: { from: "x@y.z" },
  action: { addLabelIds: ["L1"] },
  syncedAt: new Date("2026-01-01T00:00:00Z").toISOString(),
};

const del = (path: string) =>
  app.fetch(new Request(`http://localhost${path}`, { method: "DELETE" }));

afterEach(() => {
  deleteCalls.length = 0;
  deleteResult = null;
  deleteError = null;
});

describe("DELETE /filters/:gmailFilterId", () => {
  test("delegates to the core service and returns the deleted filter", async () => {
    deleteResult = FILTER;

    const res = await del(`/filters/gmail-filter-1?accountId=${ACCOUNT}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ filter: FILTER });
    expect(deleteCalls).toEqual([{ accountId: ACCOUNT, gmailFilterId: "gmail-filter-1" }]);
  });

  test("404s with a message when the filter is not this account's", async () => {
    deleteResult = null;

    const res = await del(`/filters/nope?accountId=${ACCOUNT}`);

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("filter_not_found");
    expect(body.message.length).toBeGreaterThan(0);
  });

  test("400s on a malformed accountId without calling the service", async () => {
    const res = await del("/filters/gmail-filter-1?accountId=not-a-uuid");

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "validation_failed" });
    expect(deleteCalls).toEqual([]);
  });

  test("400s when accountId is missing", async () => {
    const res = await del("/filters/gmail-filter-1");

    expect(res.status).toBe(400);
    expect(deleteCalls).toEqual([]);
  });

  test("surfaces a Gmail failure as a 502 carrying its message", async () => {
    const err = new Error("filters.delete failed") as Error & { _tag: string };
    err._tag = "GmailFilterError";
    deleteError = err;

    const res = await del(`/filters/gmail-filter-1?accountId=${ACCOUNT}`);

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: "gmail_error",
      message: "filters.delete failed",
    });
  });
});
