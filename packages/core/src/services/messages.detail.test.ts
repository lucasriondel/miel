// One message in full, the connected accounts, and a manually-set priority —
// through the store seam (#136), against the in-memory mailbox.
//
// The detail page is the one place that shows a message's whole triage history,
// applied and dismissed suggestions included, so that grouping is what most of
// this file is about.
import { beforeEach, describe, expect, test } from "bun:test";
import { makeTestStores, type TestStores } from "../testkit/stores";
import {
  getAccountByIdEffect,
  getMessageDetailEffect,
  listAccountsEffect,
  setMessagePriorityEffect,
} from "./messages";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const REF = { accountId: ACCOUNT, gmailMessageId: "m1" };

let stores: TestStores;

beforeEach(() => {
  stores = makeTestStores({
    mailbox: {
      accounts: [{ id: ACCOUNT, email: "me@example.com", displayName: "Me" }],
      messages: [
        {
          accountId: ACCOUNT,
          gmailMessageId: "m1",
          gmailThreadId: "thread-1",
          fromEmail: "sender@example.com",
          fromName: "A Sender",
          toEmails: ["me@example.com"],
          subject: "Your invoice",
          snippet: "the invoice is attached",
          bodyText: "plain body",
          bodyHtml: "<p>rich body</p>",
          rawHeaders: { "Message-ID": "<abc@example.com>" },
          internalDate: "2026-03-01T09:00:00.000Z",
        },
      ],
      labels: [{ id: "label-1", accountId: ACCOUNT, name: "Invoices", gmailLabelId: "Label_9" }],
      messageLabels: [{ accountId: ACCOUNT, gmailMessageId: "m1", labelId: "label-1" }],
      attachments: [
        { accountId: ACCOUNT, gmailMessageId: "m1", attachmentId: "att-1", filename: "inv.pdf" },
      ],
    },
  });
});

describe("getMessageDetailEffect", () => {
  test("answers null for a message that is not stored", async () => {
    expect(
      await stores.run(getMessageDetailEffect({ accountId: ACCOUNT, gmailMessageId: "nope" })),
    ).toBeNull();
  });

  test("answers the message with its body, headers, labels and attachments", async () => {
    const detail = await stores.run(getMessageDetailEffect(REF));

    expect(detail).toMatchObject({
      accountEmail: "me@example.com",
      subject: "Your invoice",
      bodyText: "plain body",
      bodyHtml: "<p>rich body</p>",
      rawHeaders: { "Message-ID": "<abc@example.com>" },
      internalDate: "2026-03-01T09:00:00.000Z",
      isArchived: false,
      isTrashed: false,
    });
    expect(detail?.labels.map((l) => l.name)).toEqual(["Invoices"]);
    expect(detail?.attachments.map((a) => a.filename)).toEqual(["inv.pdf"]);
  });

  test("has no triage history, and no latest triage, before it is triaged", async () => {
    const detail = await stores.run(getMessageDetailEffect(REF));

    expect(detail?.triageHistory).toEqual([]);
    expect(detail?.latestTriageId).toBeNull();
  });

  test("lists the triage history newest first and names the newest as the latest", async () => {
    stores.mailbox.add.triage({
      id: "t-first",
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      priority: "low",
      reasoning: "first pass",
      model: "claude-haiku-4-5",
      createdAt: "2026-03-01T10:00:00.000Z",
    });
    stores.mailbox.add.triage({
      id: "t-second",
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      priority: "high",
      reasoning: "second pass",
      model: "claude-sonnet-4-6",
      createdAt: "2026-03-01T11:00:00.000Z",
    });

    const detail = await stores.run(getMessageDetailEffect(REF));

    expect(detail?.triageHistory.map((t) => t.id)).toEqual(["t-second", "t-first"]);
    expect(detail?.triageHistory[0]).toMatchObject({
      priority: "high",
      reasoning: "second pass",
      model: "claude-sonnet-4-6",
      createdAt: "2026-03-01T11:00:00.000Z",
    });
    expect(detail?.latestTriageId).toBe("t-second");
  });

  // Unlike the list, the detail shows what became of every suggestion — that is
  // what makes it a history rather than a second inbox.
  test("groups every suggestion under its own triage, whatever its status", async () => {
    stores.mailbox.add.triage({
      id: "t-first",
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      priority: "low",
      createdAt: "2026-03-01T10:00:00.000Z",
    });
    stores.mailbox.add.triage({
      id: "t-second",
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      priority: "high",
      createdAt: "2026-03-01T11:00:00.000Z",
    });
    stores.mailbox.add.existingSuggestion({
      triageId: "t-first",
      labelId: "label-1",
      status: "applied",
    });
    stores.mailbox.add.existingSuggestion({ triageId: "t-second", labelId: "label-1" });
    stores.mailbox.add.newSuggestion({
      suggestionId: "s1",
      triageId: "t-first",
      name: "Receipts",
      reasoning: "recurring vendor",
      status: "dismissed",
    });

    const detail = await stores.run(getMessageDetailEffect(REF));
    const [second, first] = detail!.triageHistory;

    expect(second.existingLabelSuggestions).toEqual([
      {
        labelId: "label-1",
        name: "Invoices",
        colorBg: null,
        colorFg: null,
        status: "pending",
      },
    ]);
    expect(second.newLabelSuggestions).toEqual([]);
    expect(first.existingLabelSuggestions[0].status).toBe("applied");
    expect(first.newLabelSuggestions).toEqual([
      {
        suggestionId: "s1",
        name: "Receipts",
        reasoning: "recurring vendor",
        status: "dismissed",
      },
    ]);
  });
});

describe("the connected accounts", () => {
  test("are listed by email, with their timestamps as ISO strings", async () => {
    stores.mailbox.accounts.push({
      id: "33333333-3333-4333-8333-333333333333",
      email: "another@example.com",
      displayName: null,
      avatarUrl: null,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      lastSyncedAt: new Date("2026-03-01T00:00:00.000Z"),
    });

    const accounts = await stores.run(listAccountsEffect());

    expect(accounts.map((a) => a.email)).toEqual(["another@example.com", "me@example.com"]);
    expect(accounts[0].lastSyncedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(accounts[1].lastSyncedAt).toBeNull();
  });

  test("are readable one at a time, and unknown ids answer null", async () => {
    expect(await stores.run(getAccountByIdEffect(ACCOUNT))).toMatchObject({
      email: "me@example.com",
      displayName: "Me",
    });
    expect(
      await stores.run(getAccountByIdEffect("44444444-4444-4444-8444-444444444444")),
    ).toBeNull();
  });
});

describe("setMessagePriorityEffect", () => {
  test("records a manual priority as a triage of its own", async () => {
    await stores.run(setMessagePriorityEffect({ ...REF, priority: "high" }));

    expect(stores.mailbox.triages).toHaveLength(1);
    expect(stores.mailbox.triages[0]).toMatchObject({
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      priority: "high",
      reasoning: "Manually set",
    });
  });

  // The newest triage wins everywhere else, so setting a priority twice has to
  // leave the second one on top rather than editing the first.
  test("leaves the latest of two manual settings as the message's priority", async () => {
    await stores.run(setMessagePriorityEffect({ ...REF, priority: "high" }));
    await stores.run(setMessagePriorityEffect({ ...REF, priority: "low" }));

    const detail = await stores.run(getMessageDetailEffect(REF));

    expect(stores.mailbox.triages).toHaveLength(2);
    expect(detail?.triageHistory[0].priority).toBe("low");
    expect(detail?.latestTriageId).toBe(detail?.triageHistory[0].id);
  });
});
