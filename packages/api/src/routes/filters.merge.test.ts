// POST /filters/merge — the route validates its input with Zod and delegates to
// `mergeFiltersForAccount`; it owns none of the merge algebra.
//
// Only that one core function is swapped out (the real module is loaded first
// and spread back), so the Zod schema and the shared error handler under test
// are the real ones and no Postgres or Gmail call is made.
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

let mergeResult: unknown = null;
let mergeError: Error | null = null;
const mergeCalls: unknown[] = [];

const realCore = await import("@miel/core");
mock.module("@miel/core", () => ({
  ...realCore,
  mergeFiltersForAccount: async (args: unknown) => {
    mergeCalls.push(args);
    if (mergeError) throw mergeError;
    return mergeResult;
  },
}));
afterAll(() => mock.restore());

const { filtersRoutes } = await import("./filters");
const { errorHandler } = await import("../middleware/error");

const app = new Hono();
app.route("/filters", filtersRoutes);
app.onError(errorHandler);

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const MERGED = {
  id: "row-merged",
  accountId: ACCOUNT,
  gmailFilterId: "merged-1",
  criteria: { query: "{from:a@x.com OR from:b@y.com}" },
  action: { addLabelIds: ["L1", "L2"] },
  syncedAt: new Date("2026-01-01T00:00:00Z").toISOString(),
};

const post = (body: unknown) =>
  app.fetch(
    new Request("http://localhost/filters/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

/** A tagged error shaped like the one the core service raises. */
const mergeFailure = (reason: string, message: string, gmailFilterIds?: string[]) =>
  Object.assign(new Error(message), {
    _tag: "FilterMergeError",
    reason,
    gmailFilterIds,
  });

afterEach(() => {
  mergeCalls.length = 0;
  mergeResult = null;
  mergeError = null;
});

describe("POST /filters/merge", () => {
  test("delegates to the core service and returns the merged filter", async () => {
    mergeResult = {
      filter: MERGED,
      deletedGmailFilterIds: ["f1", "f2"],
      failedDeletions: [],
    };

    const res = await post({
      accountId: ACCOUNT,
      gmailFilterIds: ["f1", "f2"],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      filter: MERGED,
      deletedGmailFilterIds: ["f1", "f2"],
      failedDeletions: [],
    });
    expect(mergeCalls).toEqual([{ accountId: ACCOUNT, gmailFilterIds: ["f1", "f2"] }]);
  });

  // The merged filter exists either way, so a source Gmail refused to drop is
  // reported alongside a 200 rather than swallowed.
  test("reports sources that survived deletion", async () => {
    mergeResult = {
      filter: MERGED,
      deletedGmailFilterIds: ["f1"],
      failedDeletions: [{ gmailFilterId: "f2", message: "gmail said no" }],
    };

    const res = await post({
      accountId: ACCOUNT,
      gmailFilterIds: ["f1", "f2"],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      failedDeletions: [{ gmailFilterId: "f2", message: "gmail said no" }],
    });
  });

  test("400s on fewer than 2 filters without calling the service", async () => {
    const res = await post({ accountId: ACCOUNT, gmailFilterIds: ["f1"] });

    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      issues: { message: string }[];
    };
    expect(body.error).toBe("validation_failed");
    expect(body.issues.some((i) => /at least 2/i.test(i.message))).toBe(true);
    expect(mergeCalls).toEqual([]);
  });

  test("400s on a malformed accountId without calling the service", async () => {
    const res = await post({
      accountId: "not-a-uuid",
      gmailFilterIds: ["f1", "f2"],
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "validation_failed" });
    expect(mergeCalls).toEqual([]);
  });

  test("400s on a missing body", async () => {
    const res = await app.fetch(new Request("http://localhost/filters/merge", { method: "POST" }));

    expect(res.status).toBe(400);
    expect(mergeCalls).toEqual([]);
  });

  // Ids that aren't this account's — including another account's filters — come
  // back from the service as `unknown_filters`, which is a 404, not a 400.
  test("404s when a requested filter is not this account's", async () => {
    mergeError = mergeFailure(
      "unknown_filters",
      "No such filter on this account: other-acct-filter.",
      ["other-acct-filter"],
    );

    const res = await post({
      accountId: ACCOUNT,
      gmailFilterIds: ["f1", "other-acct-filter"],
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: "filter_merge_failed",
      reason: "unknown_filters",
      gmailFilterIds: ["other-acct-filter"],
    });
  });

  test("400s when the sources cannot be expressed as one filter", async () => {
    mergeError = mergeFailure(
      "unmergeable",
      "These filters forward to different addresses (a@x.com, b@y.com); a single filter can only forward to one.",
      ["f1", "f2"],
    );

    const res = await post({
      accountId: ACCOUNT,
      gmailFilterIds: ["f1", "f2"],
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string; reason: string };
    expect(body.reason).toBe("unmergeable");
    expect(body.message).toMatch(/forward to different addresses/);
  });

  test("surfaces a Gmail failure as a 502 carrying its message", async () => {
    const err = new Error("filters.create failed") as Error & { _tag: string };
    err._tag = "GmailFilterError";
    mergeError = err;

    const res = await post({
      accountId: ACCOUNT,
      gmailFilterIds: ["f1", "f2"],
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: "gmail_error",
      message: "filters.create failed",
    });
  });
});
