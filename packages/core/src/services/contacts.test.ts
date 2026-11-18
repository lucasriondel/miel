// Address suggestions: who an account has written to, harvested from its sent
// mail's headers during a sync and from every send through miel.
import { beforeEach, describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { makeRecordingGmail } from "../testkit/gmail";
import { makeTestStores, type TestStores } from "../testkit/stores";
import { sentQueryFor } from "../util/time";
import { parseNamedAddressList } from "../util/gmailPayload";
import { harvestSentContactsEffect, suggestContactsEffect } from "./contacts";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const EMAIL = "me@example.com";

let stores: TestStores;

beforeEach(() => {
  stores = makeTestStores({ mailbox: { accounts: [{ id: ACCOUNT, email: EMAIL }] } });
});

const meta = (id: string, at: string, headers: Record<string, string>) => ({
  id,
  threadId: `t-${id}`,
  internalDate: new Date(at),
  headers,
});

describe("harvesting sent mail", () => {
  test("reads the recipients of the window's sent mail, headers only, never the account", async () => {
    const gmail = makeRecordingGmail({
      search: () => [
        { messageId: "s1", threadId: "t1" },
        { messageId: "s2", threadId: "t2" },
        { messageId: "s3", threadId: "t3" },
      ],
      headers: {
        s1: meta("s1", "2026-06-01T10:00:00Z", {
          to: '"Martin, Claire" <claire@example.com>, bob@example.com',
          cc: `Me <${EMAIL}>`,
        }),
        s2: meta("s2", "2026-06-02T10:00:00Z", { to: "Claire <CLAIRE@example.com>" }),
      },
    });

    const read = await stores.run(
      harvestSentContactsEffect({
        accountId: ACCOUNT,
        accountEmail: EMAIL,
        query: "in:sent newer_than:7d",
        max: 50,
        gmail: gmail.adapter,
      }),
    );

    // s3 had no readable headers and is skipped rather than failing the run.
    expect(read).toBe(2);
    expect(gmail.searches).toEqual(["in:sent newer_than:7d"]);
    const all = await stores.run(suggestContactsEffect({ accountId: ACCOUNT, query: "" }));
    expect(all.map((c) => [c.email, c.name, c.timesContacted])).toEqual([
      ["claire@example.com", "Martin, Claire", 2],
      ["bob@example.com", null, 1],
    ]);
  });

  test("the window is the sync's own, over sent mail instead of the inbox", () => {
    expect(sentQueryFor("newer_than:7d -in:sent -in:trash")).toBe(
      "newer_than:7d in:sent -in:trash",
    );
    expect(sentQueryFor("after:2026/06/01 before:2026/06/08 -in:sent -in:trash")).toBe(
      "after:2026/06/01 before:2026/06/08 in:sent -in:trash",
    );
  });
});

describe("parsing an address list with names", () => {
  test("keeps a comma inside a quoted name, and drops what is not an address", () => {
    expect(
      parseNamedAddressList('"Doe, Jane" <jane@x.com>, john@y.org, undisclosed-recipients:;'),
    ).toEqual([
      { email: "jane@x.com", name: "Doe, Jane" },
      { email: "john@y.org", name: null },
    ]);
  });
});
