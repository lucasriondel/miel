// The due-work loop composes three passes — scheduled sends, snooze wakes, the
// upload sweep — each failing on its own. Run against the in-memory stores and
// a recording Gmail, with no timer.
import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { makeRecordingGmail } from "../testkit/gmail";
import { makeTestStores } from "../testkit/stores";
import { createDueWorkLoop } from "./dueWork";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-06-20T08:00:00.000Z");

describe("a due-work tick", () => {
  test("sends what is due, wakes what is due, and sweeps stale uploads", async () => {
    const stores = makeTestStores({
      mailbox: {
        accounts: [{ id: ACCOUNT, email: "me@example.com" }],
        messages: [
          { accountId: ACCOUNT, gmailMessageId: "m1", gmailThreadId: "t1", isArchived: true },
        ],
        snoozes: [
          {
            accountId: ACCOUNT,
            gmailThreadId: "t1",
            gmailMessageId: "m1",
            wakeAt: new Date(NOW.getTime() - 1),
          },
        ],
      },
    });
    stores.outbox.scheduled.push({
      id: "s1",
      accountId: ACCOUNT,
      kind: "new",
      sourceGmailMessageId: null,
      payload: { to: ["a@b.c"], subject: "x", body: "y" },
      messageIdHeader: "<miel.x@example.com>",
      sendAt: new Date(NOW.getTime() - 1),
      status: "pending",
      attempts: 0,
      claimedAt: null,
      sentAt: null,
      sentMessageId: null,
      threadId: null,
      error: null,
      createdAt: NOW,
    });
    stores.outbox.uploads.push({
      id: "u-old",
      accountId: ACCOUNT,
      filename: "a",
      mimeType: "text/plain",
      size: 1,
      data: new Uint8Array(1),
      createdAt: new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000),
    });
    const gmail = makeRecordingGmail();
    const loop = createDueWorkLoop({
      now: () => NOW,
      gmail: gmail.adapter,
      run: stores.run,
      log: () => {},
    });

    expect(await loop.tick()).toEqual({ sent: 1, failed: 0, retried: 0, woke: 1, swept: 1 });
    expect(gmail.sent).toHaveLength(1);
    expect(gmail.unarchived).toEqual([{ account: "me@example.com", threadId: "t1" }]);
  });

  test("one pass failing does not keep the others from running", async () => {
    const stores = makeTestStores({
      mailbox: {
        accounts: [{ id: ACCOUNT, email: "me@example.com" }],
        messages: [
          { accountId: ACCOUNT, gmailMessageId: "m1", gmailThreadId: "t1", isArchived: true },
        ],
        snoozes: [
          {
            accountId: ACCOUNT,
            gmailThreadId: "t1",
            gmailMessageId: "m1",
            wakeAt: new Date(NOW.getTime() - 1),
          },
        ],
      },
    });
    stores.outbox.offline = true;
    const logged: string[] = [];
    const loop = createDueWorkLoop({
      now: () => NOW,
      gmail: makeRecordingGmail().adapter,
      run: stores.run,
      log: (msg) => logged.push(msg),
    });
    const result = await loop.tick();
    expect(result.woke).toBe(1);
    expect(logged).toContain("scheduled sends errored");
  });
});
