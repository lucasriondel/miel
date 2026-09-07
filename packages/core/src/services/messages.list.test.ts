// The message list, through the store seam (#136) — the first behaviour tests
// this service has had. No Postgres, no `mock.module`, no hand-built
// query-builder fake: the real service runs against the in-memory mailbox, so
// what is asserted is what the list *means* to the person reading it — which
// messages appear, in what order, what hangs off each one, and which
// suggestions are still worth offering.
//
// The filters themselves (the SQL that answers "not archived") are
// `stores/postgres.ts`'s business; what is checked here is that the service
// asks for the right page and assembles what comes back.
import { beforeEach, describe, expect, test } from "bun:test";
import { makeTestStores, type TestStores } from "../testkit/stores";
import { listMessagesEffect } from "./messages";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const OTHER_ACCOUNT = "22222222-2222-4222-8222-222222222222";

/** Three messages, newest last, in one account. */
const inbox = {
  accounts: [
    { id: ACCOUNT, email: "me@example.com" },
    { id: OTHER_ACCOUNT, email: "other@example.com" },
  ],
  messages: [
    {
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      subject: "oldest",
      internalDate: "2026-03-01T09:00:00.000Z",
    },
    {
      accountId: ACCOUNT,
      gmailMessageId: "m2",
      subject: "middle",
      internalDate: "2026-03-02T09:00:00.000Z",
    },
    {
      accountId: ACCOUNT,
      gmailMessageId: "m3",
      subject: "newest",
      internalDate: "2026-03-03T09:00:00.000Z",
    },
  ],
};

let stores: TestStores;

beforeEach(() => {
  stores = makeTestStores({ mailbox: inbox });
});

const list = (args: Parameters<typeof listMessagesEffect>[0]) =>
  stores.run(listMessagesEffect(args));

const subjects = (items: { subject: string | null }[]) => items.map((i) => i.subject);

describe("listMessagesEffect", () => {
  test("answers newest first, with the account's own email on each row", async () => {
    const { items, nextCursor } = await list({ limit: 10 });

    expect(subjects(items)).toEqual(["newest", "middle", "oldest"]);
    expect(items.every((i) => i.accountEmail === "me@example.com")).toBe(true);
    expect(nextCursor).toBeNull();
  });

  test("keeps to one account when asked for one", async () => {
    stores.mailbox.add.message({
      accountId: OTHER_ACCOUNT,
      gmailMessageId: "x1",
      subject: "not mine",
      internalDate: "2026-03-04T09:00:00.000Z",
    });

    const { items } = await list({ accountId: ACCOUNT, limit: 10 });

    expect(subjects(items)).toEqual(["newest", "middle", "oldest"]);
  });

  test("hides archived, trashed and removed messages unless they are asked for", async () => {
    stores.mailbox.messages[0].isArchived = true;
    stores.mailbox.messages[1].isTrashed = true;
    stores.mailbox.messages[2].removedAt = new Date("2026-03-04T00:00:00.000Z");

    expect(subjects((await list({ limit: 10 })).items)).toEqual([]);
    expect(subjects((await list({ limit: 10, includeArchived: true })).items)).toEqual(["oldest"]);
    expect(subjects((await list({ limit: 10, includeTrashed: true })).items)).toEqual(["middle"]);
    expect(subjects((await list({ limit: 10, includeRemoved: true })).items)).toEqual(["newest"]);
  });

  test("filters to the messages carrying a label", async () => {
    stores.mailbox.add.label({
      id: "label-invoices",
      accountId: ACCOUNT,
      name: "Invoices",
      gmailLabelId: "Label_1",
      colorBg: "#fff",
      colorFg: "#000",
    });
    stores.mailbox.add.messageLabel({
      accountId: ACCOUNT,
      gmailMessageId: "m2",
      labelId: "label-invoices",
    });

    const { items } = await list({ limit: 10, labelId: "label-invoices" });

    expect(subjects(items)).toEqual(["middle"]);
    expect(items[0].labels).toEqual([
      {
        id: "label-invoices",
        name: "Invoices",
        gmailLabelId: "Label_1",
        colorBg: "#fff",
        colorFg: "#000",
      },
    ]);
  });

  test("carries the newest triage's priority, and filters on it", async () => {
    stores.mailbox.add.triage({
      id: "t-old",
      accountId: ACCOUNT,
      gmailMessageId: "m3",
      priority: "low",
      createdAt: "2026-03-03T10:00:00.000Z",
    });
    stores.mailbox.add.triage({
      id: "t-new",
      accountId: ACCOUNT,
      gmailMessageId: "m3",
      priority: "high",
      createdAt: "2026-03-03T11:00:00.000Z",
    });

    const all = await list({ limit: 10 });
    expect(all.items[0]).toMatchObject({ subject: "newest", priority: "high", triageId: "t-new" });
    expect(all.items[1]).toMatchObject({ subject: "middle", priority: null, triageId: null });

    expect(subjects((await list({ limit: 10, priority: "high" })).items)).toEqual(["newest"]);
    // The superseded triage does not keep the message in its old bucket.
    expect(subjects((await list({ limit: 10, priority: "low" })).items)).toEqual([]);
  });

  test("keeps to the date window it is given", async () => {
    const { items } = await list({
      limit: 10,
      internalDateFrom: "2026-03-02T00:00:00.000Z",
      internalDateTo: "2026-03-03T00:00:00.000Z",
    });

    expect(subjects(items)).toEqual(["middle"]);
  });

  test("hands out a cursor that the next page continues from", async () => {
    const first = await list({ limit: 2 });
    expect(subjects(first.items)).toEqual(["newest", "middle"]);
    expect(first.nextCursor).not.toBeNull();

    const second = await list({ limit: 2, cursor: first.nextCursor! });
    expect(subjects(second.items)).toEqual(["oldest"]);
    // Nothing beyond it, so the paging stops rather than looping.
    expect(second.nextCursor).toBeNull();
  });

  test("does not hand out a cursor when the page is the last one", async () => {
    const { items, nextCursor } = await list({ limit: 3 });

    expect(items).toHaveLength(3);
    expect(nextCursor).toBeNull();
  });

  test("ignores a cursor it cannot read rather than answering nothing", async () => {
    const { items } = await list({ limit: 10, cursor: "not-a-cursor" });

    expect(subjects(items)).toEqual(["newest", "middle", "oldest"]);
  });

  test("hangs each message's own labels and attachments off it", async () => {
    stores.mailbox.add.label({ id: "label-1", accountId: ACCOUNT, name: "Receipts" });
    stores.mailbox.add.messageLabel({
      accountId: ACCOUNT,
      gmailMessageId: "m3",
      labelId: "label-1",
    });
    stores.mailbox.add.attachment({
      accountId: ACCOUNT,
      gmailMessageId: "m3",
      attachmentId: "att-1",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      size: 2048,
    });

    const { items } = await list({ limit: 10 });
    const [newest, middle] = items;

    expect(newest.labels.map((l) => l.name)).toEqual(["Receipts"]);
    expect(newest.attachments).toEqual([
      {
        attachmentId: "att-1",
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        size: 2048,
      },
    ]);
    expect(middle.labels).toEqual([]);
    expect(middle.attachments).toEqual([]);
  });
});

describe("the pending suggestions on a listed message", () => {
  beforeEach(() => {
    stores = makeTestStores({
      mailbox: {
        ...inbox,
        labels: [
          { id: "label-work", accountId: ACCOUNT, name: "Work" },
          { id: "label-bills", accountId: ACCOUNT, name: "Bills" },
        ],
        triages: [{ id: "t1", accountId: ACCOUNT, gmailMessageId: "m3", priority: "high" }],
      },
    });
  });

  test("offers a pending suggestion of an existing label", async () => {
    stores.mailbox.add.existingSuggestion({
      triageId: "t1",
      labelId: "label-work",
      status: "pending",
    });

    const { items } = await list({ limit: 10 });

    expect(items[0].pendingSuggestions.existing).toEqual([
      { labelId: "label-work", name: "Work", colorBg: null, colorFg: null },
    ]);
  });

  test("stops offering one that has already been applied or dismissed", async () => {
    stores.mailbox.add.existingSuggestion({
      triageId: "t1",
      labelId: "label-work",
      status: "applied",
    });
    stores.mailbox.add.existingSuggestion({
      triageId: "t1",
      labelId: "label-bills",
      status: "dismissed",
    });

    const { items } = await list({ limit: 10 });

    expect(items[0].pendingSuggestions.existing).toEqual([]);
  });

  // The rule the list exists for: a label attached out of band (a filter, Gmail
  // itself) must not be offered again beside the label it produced.
  test("stops offering a label the message already carries", async () => {
    stores.mailbox.add.existingSuggestion({
      triageId: "t1",
      labelId: "label-work",
      status: "pending",
    });
    stores.mailbox.add.messageLabel({
      accountId: ACCOUNT,
      gmailMessageId: "m3",
      labelId: "label-work",
    });

    const { items } = await list({ limit: 10 });

    expect(items[0].labels.map((l) => l.name)).toEqual(["Work"]);
    expect(items[0].pendingSuggestions.existing).toEqual([]);
  });

  test("offers a pending brand-new label, and only that triage's", async () => {
    stores.mailbox.add.triage({
      id: "t-other",
      accountId: ACCOUNT,
      gmailMessageId: "m2",
      priority: "low",
      createdAt: "2026-03-02T10:00:00.000Z",
    });
    stores.mailbox.add.newSuggestion({ suggestionId: "s1", triageId: "t1", name: "Receipts" });
    stores.mailbox.add.newSuggestion({
      suggestionId: "s2",
      triageId: "t1",
      name: "Already made",
      status: "applied",
      createdLabelId: "label-work",
    });
    stores.mailbox.add.newSuggestion({
      suggestionId: "s3",
      triageId: "t-other",
      name: "Elsewhere",
    });

    const { items } = await list({ limit: 10 });

    expect(items[0].pendingSuggestions.new).toEqual([{ suggestionId: "s1", name: "Receipts" }]);
    expect(items[1].pendingSuggestions.new).toEqual([{ suggestionId: "s3", name: "Elsewhere" }]);
    expect(items[2].pendingSuggestions.new).toEqual([]);
  });
});
