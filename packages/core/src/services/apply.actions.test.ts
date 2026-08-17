// Archive, trash, mark read and the batch actions — behaviour tests through the
// store seam (#136), with a recording Gmail and the in-memory mailbox.
//
// The rule these are mostly about: Gmail archives and trashes whole *threads*,
// so miel marks whole threads too. Marking only the message the user clicked
// leaves its siblings in the list, which reads as the action having been undone.
import { beforeEach, describe, expect, test } from "bun:test";
import { Exit } from "effect";
import { runExit } from "../testkit/runExit";
import { makeRecordingGmail, type RecordingGmail } from "../testkit/gmail";
import { makeTestStores, type TestStores } from "../testkit/stores";
import {
  archiveMessageEffect,
  batchModifyMessagesEffect,
  getLatestTriageForMessageEffect,
  setMessageReadEffect,
  trashMessageEffect,
} from "./apply";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

let stores: TestStores;
let gmail: RecordingGmail;

beforeEach(() => {
  gmail = makeRecordingGmail();
  stores = makeTestStores({
    mailbox: {
      accounts: [{ id: ACCOUNT, email: "me@example.com" }],
      messages: [
        // Two messages of one thread, plus one of another.
        { accountId: ACCOUNT, gmailMessageId: "m1", gmailThreadId: "thread-a" },
        { accountId: ACCOUNT, gmailMessageId: "m2", gmailThreadId: "thread-a" },
        { accountId: ACCOUNT, gmailMessageId: "m3", gmailThreadId: "thread-b" },
      ],
      labels: [
        { id: "label-unread", accountId: ACCOUNT, name: "UNREAD", gmailLabelId: "UNREAD" },
        { id: "label-inbox", accountId: ACCOUNT, name: "INBOX", gmailLabelId: "INBOX" },
      ],
    },
  });
});

const messageRow = (gmailMessageId: string) =>
  stores.mailbox.messages.find((m) => m.gmailMessageId === gmailMessageId)!;

const attachedTo = (gmailMessageId: string) =>
  stores.mailbox.messageLabels
    .filter((ml) => ml.gmailMessageId === gmailMessageId)
    .map((ml) => ml.labelId);

describe("archiveMessageEffect", () => {
  test("archives the thread in Gmail and marks every message of it", async () => {
    const result = await stores.run(
      archiveMessageEffect({ accountId: ACCOUNT, gmailMessageId: "m1", gmail: gmail.adapter }),
    );

    expect(result).toEqual({ ok: true, threadId: "thread-a" });
    expect(gmail.archived).toEqual([{ account: "me@example.com", threadId: "thread-a" }]);
    expect(messageRow("m1").isArchived).toBe(true);
    expect(messageRow("m2").isArchived).toBe(true);
    // The other thread is untouched.
    expect(messageRow("m3").isArchived).toBe(false);
  });

  test("refuses a message that is not stored", async () => {
    const exit = await runExit(
      stores.provide(
        archiveMessageEffect({ accountId: ACCOUNT, gmailMessageId: "nope", gmail: gmail.adapter }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(gmail.archived).toEqual([]);
  });

  test("marks nothing when Gmail refuses the archive", async () => {
    gmail.fails = new Error("gmail said no");

    const exit = await runExit(
      stores.provide(
        archiveMessageEffect({ accountId: ACCOUNT, gmailMessageId: "m1", gmail: gmail.adapter }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(messageRow("m1").isArchived).toBe(false);
  });
});

describe("trashMessageEffect", () => {
  test("trashes the thread in Gmail and marks every message of it", async () => {
    const result = await stores.run(
      trashMessageEffect({ accountId: ACCOUNT, gmailMessageId: "m2", gmail: gmail.adapter }),
    );

    expect(result).toEqual({ ok: true, threadId: "thread-a" });
    expect(gmail.trashed).toEqual([{ account: "me@example.com", threadId: "thread-a" }]);
    expect(messageRow("m1").isTrashed).toBe(true);
    expect(messageRow("m2").isTrashed).toBe(true);
    expect(messageRow("m3").isTrashed).toBe(false);
    // Trashing is not archiving; the other flag stays where it was.
    expect(messageRow("m1").isArchived).toBe(false);
  });
});

describe("setMessageReadEffect", () => {
  test("reading a message drops its UNREAD label, here and in Gmail", async () => {
    stores.mailbox.add.messageLabel({
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      labelId: "label-unread",
    });

    const result = await stores.run(
      setMessageReadEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        read: true,
        gmail: gmail.adapter,
      }),
    );

    expect(result).toEqual({ ok: true, read: true });
    expect(gmail.modifications[0]).toMatchObject({ remove: ["UNREAD"], add: undefined });
    expect(attachedTo("m1")).toEqual([]);
  });

  test("marking it unread puts the label back", async () => {
    await stores.run(
      setMessageReadEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        read: false,
        gmail: gmail.adapter,
      }),
    );

    expect(gmail.modifications[0]).toMatchObject({ add: ["UNREAD"], remove: undefined });
    expect(attachedTo("m1")).toEqual(["label-unread"]);
  });

  // UNREAD is a Gmail system label; an install that has not synced its labels
  // yet still has to be able to mark a message read.
  test("still tells Gmail when the UNREAD label has never been synced", async () => {
    stores.mailbox.labels = stores.mailbox.labels.filter((l) => l.gmailLabelId !== "UNREAD");

    const result = await stores.run(
      setMessageReadEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        read: true,
        gmail: gmail.adapter,
      }),
    );

    expect(result.read).toBe(true);
    expect(gmail.modifications).toHaveLength(1);
    expect(stores.mailbox.messageLabels).toEqual([]);
  });
});

describe("batchModifyMessagesEffect", () => {
  test("does nothing, and asks Gmail nothing, for an empty selection", async () => {
    const result = await stores.run(
      batchModifyMessagesEffect({
        accountId: ACCOUNT,
        gmailMessageIds: [],
        action: "archive",
        gmail: gmail.adapter,
      }),
    );

    expect(result).toEqual({ ok: true, action: "archive", count: 0 });
    expect(gmail.modifications).toEqual([]);
  });

  test("archiving a selection removes INBOX and marks each message archived", async () => {
    stores.mailbox.add.messageLabel({
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      labelId: "label-inbox",
    });
    stores.mailbox.add.messageLabel({
      accountId: ACCOUNT,
      gmailMessageId: "m3",
      labelId: "label-inbox",
    });

    const result = await stores.run(
      batchModifyMessagesEffect({
        accountId: ACCOUNT,
        gmailMessageIds: ["m1", "m3"],
        action: "archive",
        gmail: gmail.adapter,
      }),
    );

    expect(result).toEqual({ ok: true, action: "archive", count: 2 });
    expect(gmail.modifications).toEqual([
      {
        account: "me@example.com",
        messageIds: ["m1", "m3"],
        add: undefined,
        remove: ["INBOX"],
      },
    ]);
    expect(attachedTo("m1")).toEqual([]);
    expect(attachedTo("m3")).toEqual([]);
    expect(messageRow("m1").isArchived).toBe(true);
    expect(messageRow("m3").isArchived).toBe(true);
    // Unlike the single-message archive, a batch marks what was selected —
    // m2 shares m1's thread but was not in the selection.
    expect(messageRow("m2").isArchived).toBe(false);
  });

  test("trashing a selection adds TRASH, removes INBOX and marks each trashed", async () => {
    await stores.run(
      batchModifyMessagesEffect({
        accountId: ACCOUNT,
        gmailMessageIds: ["m1"],
        action: "trash",
        gmail: gmail.adapter,
      }),
    );

    expect(gmail.modifications[0]).toMatchObject({ add: ["TRASH"], remove: ["INBOX"] });
    expect(messageRow("m1").isTrashed).toBe(true);
  });

  test("marking a selection read drops UNREAD and leaves the flags alone", async () => {
    stores.mailbox.add.messageLabel({
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      labelId: "label-unread",
    });

    await stores.run(
      batchModifyMessagesEffect({
        accountId: ACCOUNT,
        gmailMessageIds: ["m1"],
        action: "read",
        gmail: gmail.adapter,
      }),
    );

    expect(attachedTo("m1")).toEqual([]);
    expect(messageRow("m1")).toMatchObject({ isArchived: false, isTrashed: false });
  });

  test("marking a selection unread attaches UNREAD to every message in it", async () => {
    await stores.run(
      batchModifyMessagesEffect({
        accountId: ACCOUNT,
        gmailMessageIds: ["m1", "m3"],
        action: "unread",
        gmail: gmail.adapter,
      }),
    );

    expect(attachedTo("m1")).toEqual(["label-unread"]);
    expect(attachedTo("m3")).toEqual(["label-unread"]);
  });

  // A Gmail label we have never synced has no row of ours to mirror onto. That
  // is not an error — the mailbox is still the source of truth.
  test("still tells Gmail when the affected label has never been synced", async () => {
    stores.mailbox.labels = [];

    const result = await stores.run(
      batchModifyMessagesEffect({
        accountId: ACCOUNT,
        gmailMessageIds: ["m1"],
        action: "archive",
        gmail: gmail.adapter,
      }),
    );

    expect(result.count).toBe(1);
    expect(gmail.modifications).toHaveLength(1);
    expect(messageRow("m1").isArchived).toBe(true);
  });

  test("writes nothing when Gmail refuses the batch", async () => {
    gmail.fails = new Error("gmail said no");

    const exit = await runExit(
      stores.provide(
        batchModifyMessagesEffect({
          accountId: ACCOUNT,
          gmailMessageIds: ["m1"],
          action: "archive",
          gmail: gmail.adapter,
        }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(messageRow("m1").isArchived).toBe(false);
  });
});

describe("getLatestTriageForMessageEffect", () => {
  test("answers null for a message that has never been triaged", async () => {
    expect(
      await stores.run(
        getLatestTriageForMessageEffect({ accountId: ACCOUNT, gmailMessageId: "m1" }),
      ),
    ).toBeNull();
  });

  test("answers the newest triage with its suggestions, whatever their status", async () => {
    stores.mailbox.add.label({ id: "label-work", accountId: ACCOUNT, name: "Work" });
    stores.mailbox.add.triage({
      id: "t-old",
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      priority: "low",
      createdAt: "2026-03-01T10:00:00.000Z",
    });
    stores.mailbox.add.triage({
      id: "t-new",
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      priority: "high",
      createdAt: "2026-03-01T11:00:00.000Z",
    });
    stores.mailbox.add.existingSuggestion({
      triageId: "t-new",
      labelId: "label-work",
      status: "applied",
    });
    stores.mailbox.add.existingSuggestion({ triageId: "t-old", labelId: "label-work" });
    stores.mailbox.add.newSuggestion({
      suggestionId: "s1",
      triageId: "t-new",
      name: "Receipts",
    });

    const latest = await stores.run(
      getLatestTriageForMessageEffect({ accountId: ACCOUNT, gmailMessageId: "m1" }),
    );

    expect(latest).toEqual({
      triageId: "t-new",
      priority: "high",
      existingLabelSuggestions: [{ labelId: "label-work", name: "Work", status: "applied" }],
      newLabelSuggestions: [{ suggestionId: "s1", name: "Receipts", status: "pending" }],
    });
  });
});
