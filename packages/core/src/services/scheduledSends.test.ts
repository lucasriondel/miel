// Schedule send: miel holds the message and sends it when it is due, through
// the same send services an immediate send uses. The loop's guarantees — one
// claim per row, retries for what may pass, a failed state for what will not,
// and no second copy of a send that already landed — are asserted here against
// the in-memory outbox and a recording Gmail.
import { beforeEach, describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { makeRecordingGmail, type RecordingGmail } from "../testkit/gmail";
import { expectFailureTag, runExit } from "../testkit/runExit";
import { makeTestStores, type TestStores } from "../testkit/stores";
import {
  MAX_SEND_ATTEMPTS,
  STALE_CLAIM_MS,
  cancelScheduledEffect,
  listScheduledEffect,
  rescheduleEffect,
  runDueScheduledSendsEffect,
  scheduleSendEffect,
} from "./scheduledSends";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const EMAIL = "me@example.com";
const NOW = new Date("2026-06-20T08:00:00.000Z");
const MONDAY = new Date("2026-06-22T08:00:00.000Z");

let stores: TestStores;
let gmail: RecordingGmail;
let found: { messageId: string; threadId: string }[];

beforeEach(() => {
  found = [];
  gmail = makeRecordingGmail({ search: () => found });
  stores = makeTestStores({
    mailbox: {
      accounts: [{ id: ACCOUNT, email: EMAIL }],
      messages: [
        {
          accountId: ACCOUNT,
          gmailMessageId: "m1",
          gmailThreadId: "thread-1",
          fromEmail: "claire@example.com",
          subject: "Dinner",
          bodyText: "8?",
        },
      ],
    },
  });
});

const scheduleNew = (sendAt = MONDAY) =>
  scheduleSendEffect({
    accountId: ACCOUNT,
    kind: "new",
    payload: { to: ["claire@example.com"], subject: "Dinner", body: "Nine?" },
    sendAt,
    now: NOW,
    gmail: gmail.adapter,
  });

describe("scheduling", () => {
  test("stores a pending send with a Message-ID of its own, and lists it", async () => {
    const view = await stores.run(scheduleNew());
    expect(view).toMatchObject({
      kind: "new",
      status: "pending",
      sendAt: MONDAY.toISOString(),
      to: ["claire@example.com"],
      subject: "Dinner",
      preview: "Nine?",
    });
    expect(stores.outbox.scheduled[0].messageIdHeader).toMatch(/^<miel\.[0-9a-f-]+@example\.com>$/);
    expect(
      (await stores.run(listScheduledEffect({ accountId: ACCOUNT }))).map((s) => s.id),
    ).toEqual([view.id]);
    expect(gmail.sent).toEqual([]);
  });

  test("refuses a time that has passed, a missing source message and an unknown upload", async () => {
    expectFailureTag(await runExit(stores.provide(scheduleNew(NOW))), "ComposeRefusedError");
    expectFailureTag(
      await runExit(
        stores.provide(
          scheduleSendEffect({
            accountId: ACCOUNT,
            kind: "reply",
            sourceGmailMessageId: "nope",
            payload: { to: [], subject: "Re: x", body: "x" },
            sendAt: MONDAY,
            now: NOW,
            gmail: gmail.adapter,
          }),
        ),
      ),
      "ComposeRefusedError",
    );
    expectFailureTag(
      await runExit(
        stores.provide(
          scheduleSendEffect({
            accountId: ACCOUNT,
            kind: "new",
            payload: {
              to: ["a@b.c"],
              subject: "x",
              body: "x",
              uploadIds: ["99999999-9999-4999-8999-999999999999"],
            },
            sendAt: MONDAY,
            now: NOW,
            gmail: gmail.adapter,
          }),
        ),
      ),
      "ComposeRefusedError",
    );
    expect(stores.outbox.scheduled).toEqual([]);
  });

  test("a pending send can be cancelled or moved; a sent one cannot", async () => {
    const view = await stores.run(scheduleNew());
    const later = new Date("2026-06-23T08:00:00.000Z");
    expect(
      (await stores.run(rescheduleEffect({ id: view.id, sendAt: later, now: NOW }))).sendAt,
    ).toBe(later.toISOString());
    expect((await stores.run(cancelScheduledEffect(view.id))).status).toBe("cancelled");
    expectFailureTag(
      await runExit(stores.provide(cancelScheduledEffect(view.id))),
      "ComposeRefusedError",
    );
    expectFailureTag(
      await runExit(stores.provide(cancelScheduledEffect("00000000-0000-4000-8000-000000000000"))),
      "ComposeRefusedError",
    );
  });
});

describe("the due-work pass", () => {
  test("sends what is due with its own Message-ID, once", async () => {
    const view = await stores.run(scheduleNew());
    expect(
      await stores.run(runDueScheduledSendsEffect({ now: NOW, gmail: gmail.adapter })),
    ).toEqual([]);

    const first = await stores.run(
      runDueScheduledSendsEffect({ now: MONDAY, gmail: gmail.adapter }),
    );
    const second = await stores.run(
      runDueScheduledSendsEffect({ now: MONDAY, gmail: gmail.adapter }),
    );

    expect(first).toEqual([{ id: view.id, outcome: "sent" }]);
    expect(second).toEqual([]);
    expect(gmail.sent).toHaveLength(1);
    expect(gmail.sent[0]).toMatchObject({
      to: ["claire@example.com"],
      messageId: stores.outbox.scheduled[0].messageIdHeader,
    });
    expect(stores.outbox.scheduled[0]).toMatchObject({ status: "sent", sentMessageId: "sent-1" });
  });

  test("a scheduled reply is threaded and quoted when it goes, like any reply", async () => {
    await stores.run(
      scheduleSendEffect({
        accountId: ACCOUNT,
        kind: "reply",
        sourceGmailMessageId: "m1",
        payload: { to: [], subject: "Re: Dinner", body: "Nine." },
        sendAt: MONDAY,
        now: NOW,
        gmail: gmail.adapter,
      }),
    );
    await stores.run(runDueScheduledSendsEffect({ now: MONDAY, gmail: gmail.adapter }));
    expect(gmail.sent[0]).toMatchObject({ replyToMessageId: "m1", to: ["claire@example.com"] });
    expect(gmail.sent[0].body).toContain("> 8?");
  });

  test("a send that fails for a reason that may pass is retried later, then given up", async () => {
    await stores.run(scheduleNew());
    gmail.fails = new Error("ETIMEDOUT");
    let at = MONDAY;
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
      const [result] = await stores.run(
        runDueScheduledSendsEffect({ now: at, gmail: gmail.adapter }),
      );
      expect(result.outcome).toBe(attempt < MAX_SEND_ATTEMPTS ? "retry" : "failed");
      at = new Date(stores.outbox.scheduled[0].sendAt.getTime() + 1);
    }
    expect(stores.outbox.scheduled[0]).toMatchObject({ status: "failed", error: "ETIMEDOUT" });
  });

  test("Gmail refusing the message itself fails it at once, with Gmail's reason", async () => {
    await stores.run(scheduleNew());
    gmail.fails = Object.assign(new Error(""), {
      _tag: "GmailSendError",
      detail: "Invalid To header",
    });
    const [result] = await stores.run(
      runDueScheduledSendsEffect({ now: MONDAY, gmail: gmail.adapter }),
    );
    expect(result.outcome).toBe("failed");
    expect(stores.outbox.scheduled[0].error).toBe("Invalid To header");
  });

  test("a failed send can be rescheduled, which gives it a fresh set of attempts", async () => {
    const view = await stores.run(scheduleNew());
    gmail.fails = Object.assign(new Error(""), { _tag: "GmailSendError", detail: "nope" });
    await stores.run(runDueScheduledSendsEffect({ now: MONDAY, gmail: gmail.adapter }));
    gmail.fails = null;
    const next = new Date(MONDAY.getTime() + 60_000);
    await stores.run(rescheduleEffect({ id: view.id, sendAt: next, now: MONDAY }));
    expect(
      await stores.run(runDueScheduledSendsEffect({ now: next, gmail: gmail.adapter })),
    ).toEqual([{ id: view.id, outcome: "sent" }]);
  });

  test("a send left in flight by a dead process is not sent twice if its first attempt landed", async () => {
    await stores.run(scheduleNew());
    // The first claim, by a process that died before it could record anything.
    await stores.run(stores.outbox.claimDue({ now: MONDAY, staleBefore: new Date(0), limit: 10 }));
    found = [{ messageId: "landed-1", threadId: "thread-landed" }];

    const later = new Date(MONDAY.getTime() + STALE_CLAIM_MS + 1);
    const [result] = await stores.run(
      runDueScheduledSendsEffect({ now: later, gmail: gmail.adapter }),
    );

    expect(result.outcome).toBe("sent");
    expect(gmail.sent).toEqual([]);
    expect(gmail.searches[0]).toMatch(/^rfc822msgid:miel\./);
    expect(stores.outbox.scheduled[0]).toMatchObject({ status: "sent", sentMessageId: "landed-1" });
  });

  test("…and is sent when its first attempt did not land", async () => {
    await stores.run(scheduleNew());
    await stores.run(stores.outbox.claimDue({ now: MONDAY, staleBefore: new Date(0), limit: 10 }));
    const later = new Date(MONDAY.getTime() + STALE_CLAIM_MS + 1);
    const [result] = await stores.run(
      runDueScheduledSendsEffect({ now: later, gmail: gmail.adapter }),
    );
    expect(result.outcome).toBe("sent");
    expect(gmail.sent).toHaveLength(1);
  });
});
