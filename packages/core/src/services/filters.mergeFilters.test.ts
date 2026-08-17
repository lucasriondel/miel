// mergeFiltersForAccount: create the merged filter in Gmail first, and only
// then delete the originals — a failure anywhere must not leave the account
// holding neither the sources nor a replacement.
//
// The db is faked at `../db/client` (same trick as filters.deleteFilter.test) so
// this runs without Postgres: the service's query shapes are fixed, so the fake
// only needs `select().from().innerJoin().where()`,
// `insert().values().returning()` and `delete().where()`.
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

afterAll(() => mock.restore());

const ACCOUNT = "acct-1";
const EMAIL = "me@example.com";

const row = (
  gmailFilterId: string,
  criteria: Record<string, unknown>,
  action: Record<string, unknown> = { addLabelIds: ["L1"] },
) => ({
  id: `row-${gmailFilterId}`,
  accountId: ACCOUNT,
  gmailFilterId,
  criteria,
  action,
  syncedAt: new Date("2026-01-01T00:00:00Z"),
  accountEmail: EMAIL,
});

/** Rows the scoped lookup "finds" for the requested ids. */
let selectRows: ReturnType<typeof row>[] = [];
let insertValues: unknown[] = [];
let deleteCount = 0;

mock.module("../db/client", () => ({
  getDb: () => ({
    db: {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve(selectRows),
          }),
        }),
      }),
      insert: () => ({
        values: (values: unknown) => {
          insertValues.push(values);
          return {
            returning: () =>
              Promise.resolve([
                {
                  id: "row-merged",
                  ...(values as Record<string, unknown>),
                },
              ]),
          };
        },
      }),
      delete: () => ({
        where: () => {
          deleteCount += 1;
          return Promise.resolve([]);
        },
      }),
    },
  }),
}));

const { mergeFiltersForAccountEffect } = await import("./filters");
const { runPromiseRethrow } = await import("../util/effect");
const { FilterMergeError } = await import("../errors");

interface GmailCalls {
  created: unknown[];
  deleted: string[];
}

const gmailStub = (opts: {
  calls: GmailCalls;
  createId?: string;
  createThrows?: Error;
  deleteThrowsFor?: Record<string, string>;
}) =>
  ({
    createFilter: async (o: Record<string, unknown>) => {
      opts.calls.created.push(o);
      if (opts.createThrows) throw opts.createThrows;
      return {
        id: opts.createId ?? "merged-1",
        criteria: { query: o.query },
        action: {},
      };
    },
    deleteFilter: async (o: { filterId: string }) => {
      const boom = opts.deleteThrowsFor?.[o.filterId];
      if (boom) throw new Error(boom);
      opts.calls.deleted.push(o.filterId);
    },
  }) as unknown as Parameters<typeof mergeFiltersForAccountEffect>[0]["gmail"];

const run = (args: {
  accountId: string;
  gmailFilterIds: string[];
  gmail?: ReturnType<typeof gmailStub>;
}) => runPromiseRethrow(mergeFiltersForAccountEffect(args));

describe("mergeFiltersForAccountEffect", () => {
  let calls: GmailCalls;

  beforeEach(() => {
    calls = { created: [], deleted: [] };
    insertValues = [];
    deleteCount = 0;
    selectRows = [
      row("f1", { from: "a@x.com" }, { addLabelIds: ["L1"] }),
      row("f2", { from: "b@y.com" }, { addLabelIds: ["L2"] }),
      row("f3", { subject: "monthly report" }, { addLabelIds: ["L1"] }),
    ];
  });

  test("creates one OR'd filter with the union action, then deletes the sources", async () => {
    const result = await run({
      accountId: ACCOUNT,
      gmailFilterIds: ["f1", "f2", "f3"],
      gmail: gmailStub({ calls, createId: "merged-9" }),
    });

    expect(calls.created).toEqual([
      {
        account: EMAIL,
        query: "{from:a@x.com OR from:b@y.com OR subject:(monthly report)}",
        addLabelIds: ["L1", "L2"],
      },
    ]);
    // Sources go only after the replacement exists.
    expect(calls.deleted).toEqual(["f1", "f2", "f3"]);
    expect(result.filter.gmailFilterId).toBe("merged-9");
    expect(result.filter.criteria).toEqual({
      query: "{from:a@x.com OR from:b@y.com OR subject:(monthly report)}",
    });
    expect(result.filter.action).toEqual({ addLabelIds: ["L1", "L2"] });
    expect(result.deletedGmailFilterIds).toEqual(["f1", "f2", "f3"]);
    expect(result.failedDeletions).toEqual([]);
    // One insert for the merged filter, one delete statement for the sources.
    expect(insertValues).toHaveLength(1);
    expect(deleteCount).toBe(1);
    expect(result.filter).not.toHaveProperty("accountEmail");
  });

  test("passes a removal-only union action through as removeLabelIds", async () => {
    selectRows = [
      row("f1", { from: "a@x.com" }, { removeLabelIds: ["INBOX"] }),
      row("f2", { from: "b@y.com" }, { removeLabelIds: ["INBOX", "UNREAD"] }),
    ];

    await run({
      accountId: ACCOUNT,
      gmailFilterIds: ["f1", "f2"],
      gmail: gmailStub({ calls }),
    });

    expect(calls.created).toEqual([
      {
        account: EMAIL,
        query: "{from:a@x.com OR from:b@y.com}",
        removeLabelIds: ["INBOX", "UNREAD"],
      },
    ]);
  });

  test("keeps the sources when the merged filter cannot be created", async () => {
    const promise = run({
      accountId: ACCOUNT,
      gmailFilterIds: ["f1", "f2", "f3"],
      gmail: gmailStub({ calls, createThrows: new Error("gmail said no") }),
    });

    await expect(promise).rejects.toThrow("gmail said no");
    expect(calls.deleted).toEqual([]);
    expect(insertValues).toEqual([]);
    expect(deleteCount).toBe(0);
  });

  test("reports which originals survived when a delete fails partway", async () => {
    const result = await run({
      accountId: ACCOUNT,
      gmailFilterIds: ["f1", "f2", "f3"],
      gmail: gmailStub({
        calls,
        deleteThrowsFor: { f2: "filter is gone-ish" },
      }),
    });

    expect(result.filter.gmailFilterId).toBe("merged-1");
    // f3 is still attempted after f2 fails.
    expect(calls.deleted).toEqual(["f1", "f3"]);
    expect(result.deletedGmailFilterIds).toEqual(["f1", "f3"]);
    expect(result.failedDeletions).toEqual([
      { gmailFilterId: "f2", message: "filter is gone-ish" },
    ]);
  });

  test("does not run a local delete when every Gmail delete failed", async () => {
    const result = await run({
      accountId: ACCOUNT,
      gmailFilterIds: ["f1", "f2", "f3"],
      gmail: gmailStub({
        calls,
        deleteThrowsFor: { f1: "no", f2: "no", f3: "no" },
      }),
    });

    expect(result.deletedGmailFilterIds).toEqual([]);
    expect(result.failedDeletions).toHaveLength(3);
    expect(deleteCount).toBe(0);
  });

  test("rejects fewer than 2 distinct filters without touching Gmail", async () => {
    const promise = run({
      accountId: ACCOUNT,
      gmailFilterIds: ["f1", "f1"],
      gmail: gmailStub({ calls }),
    });

    await expect(promise).rejects.toThrow(FilterMergeError);
    await expect(promise).rejects.toThrow(/at least 2/i);
    expect(calls.created).toEqual([]);
  });

  test("rejects ids that are not this account's filters", async () => {
    selectRows = [row("f1", { from: "a@x.com" })];

    const promise = run({
      accountId: ACCOUNT,
      gmailFilterIds: ["f1", "other-account-filter"],
      gmail: gmailStub({ calls }),
    });

    await expect(promise).rejects.toThrow(FilterMergeError);
    await expect(promise).rejects.toThrow(/other-account-filter/);
    expect(calls.created).toEqual([]);
    expect(deleteCount).toBe(0);
  });

  test("carries the merge reason so the boundary can pick a status", async () => {
    selectRows = [row("f1", { from: "a@x.com" })];

    const err = (await run({
      accountId: ACCOUNT,
      gmailFilterIds: ["f1", "nope"],
      gmail: gmailStub({ calls }),
    }).catch((e) => e)) as InstanceType<typeof FilterMergeError>;

    expect(err._tag).toBe("FilterMergeError");
    expect(err.reason).toBe("unknown_filters");
    expect(err.gmailFilterIds).toEqual(["nope"]);
  });

  test("merges duplicated ids once", async () => {
    selectRows = [row("f1", { from: "a@x.com" }), row("f2", { from: "b@y.com" })];

    const result = await run({
      accountId: ACCOUNT,
      gmailFilterIds: ["f1", "f2", "f1"],
      gmail: gmailStub({ calls }),
    });

    expect(calls.deleted).toEqual(["f1", "f2"]);
    expect(result.deletedGmailFilterIds).toEqual(["f1", "f2"]);
  });
});
