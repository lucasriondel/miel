// Snooze: archived in Gmail until a time, then back in the inbox, unread. Gmail
// is told first and the local write follows, so these run against a recording
// Gmail and the in-memory mailbox.
import { beforeEach, describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { makeRecordingGmail, type RecordingGmail } from "../testkit/gmail";
import { expectFailureTag, runExit } from "../testkit/runExit";
import { makeTestStores, type TestStores } from "../testkit/stores";
import { listMessagesEffect } from "./messages";
import {
  WAKE_RETRY_MS,
  snoozeMessageEffect,
  unsnoozeMessageEffect,
  wakeDueSnoozesEffect,
} from "./snooze";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const EMAIL = "me@example.com";
const NOW = new Date("2026-06-20T08:00:00.000Z");
const LATER = new Date("2026-06-21T08:00:00.000Z");

let stores: TestStores;
let gmail: RecordingGmail;

beforeEach(() => {
  gmail = makeRecordingGmail();
  stores = makeTestStores({
    mailbox: {
      accounts: [{ id: ACCOUNT, email: EMAIL }],
      messages: [
        { accountId: ACCOUNT, gmailMessageId: "m1", gmailThreadId: "t1" },
        { accountId: ACCOUNT, gmailMessageId: "m2", gmailThreadId: "t1" },
        { accountId: ACCOUNT, gmailMessageId: "m3", gmailThreadId: "t3", isArchived: true },
      ],
      labels: [
        {
          id: "label-unread",
          accountId: ACCOUNT,
          name: "UNREAD",
          gmailLabelId: "UNREAD",
          type: "system",
        },
      ],
    },
  });
});

const snooze = (until = LATER) =>
  snoozeMessageEffect({
    accountId: ACCOUNT,
    gmailMessageId: "m1",
    until,
    now: NOW,
    gmail: gmail.adapter,
  });

const view = (flags: { snoozedOnly?: boolean; archivedOnly?: boolean }) =>
  stores.run(listMessagesEffect({ accountId: ACCOUNT, limit: 50, ...flags }));

describe("snoozing", () => {
  test("archives the thread in Gmail, and moves it from the inbox to the Snoozed view", async () => {
    const result = await stores.run(snooze());

    expect(result).toEqual({ ok: true, threadId: "t1", snoozedUntil: LATER.toISOString() });
    expect(gmail.archived).toEqual([{ account: EMAIL, threadId: "t1" }]);
    expect((await view({})).items).toEqual([]);
    const snoozed = await view({ snoozedOnly: true });
    expect(snoozed.items.map((m) => m.gmailMessageId).toSorted()).toEqual(["m1", "m2"]);
    expect(snoozed.items[0].snoozedUntil).toBe(LATER.toISOString());
    // Done is archived mail that is not snoozed.
    expect((await view({ archivedOnly: true })).items.map((m) => m.gmailMessageId)).toEqual(["m3"]);
  });

  test("a time that has passed is refused, and Gmail is not asked", async () => {
    const exit = await runExit(stores.provide(snooze(new Date(NOW.getTime() - 1))));
    expectFailureTag(exit, "ComposeRefusedError");
    expect(gmail.archived).toEqual([]);
    expect(stores.mailbox.snoozes).toEqual([]);
  });

  test("a refusal from Gmail leaves nothing written", async () => {
    gmail.fails = new Error("boom");
    const exit = await runExit(stores.provide(snooze()));
    expect(exit._tag).toBe("Failure");
    expect(stores.mailbox.snoozes).toEqual([]);
    expect(stores.mailbox.messages.find((m) => m.gmailMessageId === "m1")?.isArchived).toBe(false);
  });

  test("unsnoozing puts it back in the inbox now, without marking it unread", async () => {
    await stores.run(snooze());
    await stores.run(
      unsnoozeMessageEffect({ accountId: ACCOUNT, gmailMessageId: "m1", gmail: gmail.adapter }),
    );
    expect(gmail.unarchived).toEqual([{ account: EMAIL, threadId: "t1" }]);
    expect(stores.mailbox.snoozes).toEqual([]);
    expect((await view({})).items).toHaveLength(2);
    expect(gmail.modifications).toEqual([]);
  });
});

describe("waking", () => {
  test("puts INBOX back, marks the snoozed message unread, and drops the snooze", async () => {
    await stores.run(snooze());
    const woke = await stores.run(wakeDueSnoozesEffect({ now: LATER, gmail: gmail.adapter }));

    expect(woke).toBe(1);
    expect(gmail.unarchived).toEqual([{ account: EMAIL, threadId: "t1" }]);
    expect(gmail.modifications).toEqual([{ account: EMAIL, messageIds: ["m1"], add: ["UNREAD"] }]);
    expect(stores.mailbox.snoozes).toEqual([]);
    expect(stores.mailbox.messageLabels).toContainEqual({
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      labelId: "label-unread",
    });
    expect((await view({})).items).toHaveLength(2);
  });

  test("nothing wakes before its time", async () => {
    await stores.run(snooze());
    expect(await stores.run(wakeDueSnoozesEffect({ now: NOW, gmail: gmail.adapter }))).toBe(0);
    expect(gmail.unarchived).toEqual([]);
  });

  test("a wake Gmail refuses is tried again later, not on every tick", async () => {
    await stores.run(snooze());
    gmail.fails = new Error("invalid_grant");
    expect(await stores.run(wakeDueSnoozesEffect({ now: LATER, gmail: gmail.adapter }))).toBe(0);
    expect(stores.mailbox.snoozes[0].wakeAt.getTime()).toBe(LATER.getTime() + WAKE_RETRY_MS);
  });
});
