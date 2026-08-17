// deleteFilterForAccount: the local row is only dropped once Gmail has actually
// dropped the filter, and the lookup is scoped by account so one account can
// never delete another's filter.
//
// The db is faked at `../db/client` (same trick as GoogleAuth.test) so this runs
// without Postgres: the service's query shape is fixed, so the fake only needs
// `select().from().innerJoin().where().limit()` and `delete().where()`.
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

// Restore the process-global ../db/client mock so it doesn't leak into other
// suites in the same run.
afterAll(() => mock.restore());

const FILTER_ROW = {
  id: "row-1",
  accountId: "acct-1",
  gmailFilterId: "gmail-filter-1",
  criteria: { from: "x@y.z" },
  action: { addLabelIds: ["L1"] },
  syncedAt: new Date("2026-01-01T00:00:00Z"),
  accountEmail: "me@example.com",
};

/** Rows the scoped lookup "finds"; empty means no match for that account. */
let selectRows: unknown[] = [];
let deleteCount = 0;

mock.module("../db/client", () => ({
  getDb: () => ({
    db: {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve(selectRows),
            }),
          }),
        }),
      }),
      delete: () => ({
        where: () => {
          deleteCount += 1;
          return Promise.resolve([]);
        },
      }),
    },
  }),
  // Carried for the files loaded after this one: the mock is process-global, and
  // one importing the barrel would fail to link without every export present.
  closeDb: async () => {},
}));

const { deleteFilterForAccountEffect } = await import("./filters");
const { runPromiseRethrow } = await import("../util/effect");

const gmailStub = (over: Record<string, unknown> = {}) =>
  ({
    deleteFilter: async () => {},
    ...over,
  }) as unknown as Parameters<typeof deleteFilterForAccountEffect>[0]["gmail"];

const run = (args: {
  accountId: string;
  gmailFilterId: string;
  gmail?: ReturnType<typeof gmailStub>;
}) => runPromiseRethrow(deleteFilterForAccountEffect(args));

describe("deleteFilterForAccountEffect", () => {
  beforeEach(() => {
    selectRows = [FILTER_ROW];
    deleteCount = 0;
  });

  test("deletes in Gmail with the account's email, then drops the local row", async () => {
    let received: unknown = null;
    const deleted = await run({
      accountId: "acct-1",
      gmailFilterId: "gmail-filter-1",
      gmail: gmailStub({
        deleteFilter: async (o: unknown) => {
          received = o;
        },
      }),
    });

    expect(received).toEqual({
      account: "me@example.com",
      filterId: "gmail-filter-1",
    });
    expect(deleteCount).toBe(1);
    expect(deleted?.gmailFilterId).toBe("gmail-filter-1");
    // The joined account email is an internal lookup detail, not part of the row.
    expect(deleted).not.toHaveProperty("accountEmail");
  });

  test("returns null and touches nothing when the id is not this account's", async () => {
    selectRows = [];
    let called = false;

    const deleted = await run({
      accountId: "other-acct",
      gmailFilterId: "gmail-filter-1",
      gmail: gmailStub({
        deleteFilter: async () => {
          called = true;
        },
      }),
    });

    expect(deleted).toBeNull();
    expect(called).toBe(false);
    expect(deleteCount).toBe(0);
  });

  test("keeps the local row when the Gmail delete fails", async () => {
    const promise = run({
      accountId: "acct-1",
      gmailFilterId: "gmail-filter-1",
      gmail: gmailStub({
        deleteFilter: async () => {
          throw new Error("gmail said no");
        },
      }),
    });

    await expect(promise).rejects.toThrow("gmail said no");
    expect(deleteCount).toBe(0);
  });
});
