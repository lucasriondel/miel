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
  setMessageReadEffect,
  trashMessageEffect,
  unarchiveMessageEffect,
  untrashMessageEffect,
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

// The Undo behind "Archived · Undo" and "Moved to trash · Undo", and the way a
// message leaves the Done view: each action read backwards, in the same order —
// Gmail first, then the same thread-wide local write with the flag cleared.
describe("unarchiveMessageEffect", () => {
  test("puts the thread back in Gmail's inbox and clears the flag thread-wide", async () => {
    for (const id of ["m1", "m2", "m3"]) messageRow(id).isArchived = true;

    const result = await stores.run(
      unarchiveMessageEffect({ accountId: ACCOUNT, gmailMessageId: "m2", gmail: gmail.adapter }),
    );

    expect(result).toEqual({ ok: true, threadId: "thread-a" });
    expect(gmail.unarchived).toEqual([{ account: "me@example.com", threadId: "thread-a" }]);
    expect(messageRow("m1").isArchived).toBe(false);
    expect(messageRow("m2").isArchived).toBe(false);
    expect(messageRow("m3").isArchived).toBe(true);
  });

  test("leaves the message archived when Gmail refuses", async () => {
    messageRow("m1").isArchived = true;
    gmail.fails = new Error("gmail said no");

    const exit = await runExit(
      stores.provide(
        unarchiveMessageEffect({ accountId: ACCOUNT, gmailMessageId: "m1", gmail: gmail.adapter }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(messageRow("m1").isArchived).toBe(true);
  });
});

describe("untrashMessageEffect", () => {
  test("restores the thread to the inbox, clearing trash and archive both", async () => {
    // Archived first, then trashed: untrash puts INBOX back, so it is in the
    // inbox again rather than in Done.
    Object.assign(messageRow("m1"), { isTrashed: true, isArchived: true });
    Object.assign(messageRow("m2"), { isTrashed: true });

    const result = await stores.run(
      untrashMessageEffect({ accountId: ACCOUNT, gmailMessageId: "m1", gmail: gmail.adapter }),
    );

    expect(result).toEqual({ ok: true, threadId: "thread-a" });
    expect(gmail.untrashed).toEqual([{ account: "me@example.com", threadId: "thread-a" }]);
    for (const id of ["m1", "m2"]) {
      expect(messageRow(id)).toMatchObject({ isTrashed: false, isArchived: false });
    }
  });

  test("refuses a message that is not stored, asking Gmail nothing", async () => {
    const exit = await runExit(
      stores.provide(
        untrashMessageEffect({ accountId: ACCOUNT, gmailMessageId: "nope", gmail: gmail.adapter }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(gmail.untrashed).toEqual([]);
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

  // The section-level Undo: the same two writes as a selection's archive and
  // trash, read backwards.
  test("unarchiving a selection adds INBOX back and clears each archive flag", async () => {
    for (const id of ["m1", "m3"]) messageRow(id).isArchived = true;

    await stores.run(
      batchModifyMessagesEffect({
        accountId: ACCOUNT,
        gmailMessageIds: ["m1", "m3"],
        action: "unarchive",
        gmail: gmail.adapter,
      }),
    );

    expect(gmail.modifications[0]).toMatchObject({ add: ["INBOX"], remove: undefined });
    expect(attachedTo("m1")).toEqual(["label-inbox"]);
    expect(messageRow("m1").isArchived).toBe(false);
    expect(messageRow("m3").isArchived).toBe(false);
  });

  test("untrashing a selection lifts TRASH, adds INBOX and clears the flags", async () => {
    Object.assign(messageRow("m1"), { isTrashed: true, isArchived: true });

    await stores.run(
      batchModifyMessagesEffect({
        accountId: ACCOUNT,
        gmailMessageIds: ["m1"],
        action: "untrash",
        gmail: gmail.adapter,
      }),
    );

    expect(gmail.modifications[0]).toMatchObject({ add: ["INBOX"], remove: ["TRASH"] });
    expect(messageRow("m1")).toMatchObject({ isTrashed: false, isArchived: false });
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

  // #147. The fifth action is the only one carrying a payload — which label —
  // and the label is named by *our* row id, resolved against the account before
  // Gmail hears about it.
  describe("labelling a selection", () => {
    beforeEach(() => {
      stores.mailbox.add.label({
        id: "label-work",
        accountId: ACCOUNT,
        name: "Work",
        gmailLabelId: "Label_7",
      });
    });

    test("adds the label in Gmail and mirrors it onto every selected message", async () => {
      const result = await stores.run(
        batchModifyMessagesEffect({
          accountId: ACCOUNT,
          gmailMessageIds: ["m1", "m3"],
          action: "label",
          labelId: "label-work",
          gmail: gmail.adapter,
        }),
      );

      expect(result).toEqual({ ok: true, action: "label", count: 2 });
      expect(gmail.modifications).toEqual([
        {
          account: "me@example.com",
          messageIds: ["m1", "m3"],
          add: ["Label_7"],
          remove: undefined,
        },
      ]);
      expect(attachedTo("m1")).toEqual(["label-work"]);
      expect(attachedTo("m3")).toEqual(["label-work"]);
      // Labelling is not archiving: the rows stay where they are.
      expect(messageRow("m1")).toMatchObject({ isArchived: false, isTrashed: false });
      // m2 shares m1's thread but was not selected — a batch labels the
      // messages it names, never their threads.
      expect(attachedTo("m2")).toEqual([]);
    });

    test("refuses a label belonging to another account, and tells Gmail nothing", async () => {
      const other = "22222222-2222-4222-8222-222222222222";
      stores.mailbox.add.account({ id: other, email: "other@example.com" });
      stores.mailbox.add.label({
        id: "label-theirs",
        accountId: other,
        name: "Theirs",
        gmailLabelId: "Label_9",
      });

      const exit = await runExit(
        stores.provide(
          batchModifyMessagesEffect({
            accountId: ACCOUNT,
            gmailMessageIds: ["m1"],
            action: "label",
            labelId: "label-theirs",
            gmail: gmail.adapter,
          }),
        ),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      expect(gmail.modifications).toEqual([]);
      expect(attachedTo("m1")).toEqual([]);
    });

    test("asks Gmail nothing for an empty selection, label or not", async () => {
      const result = await stores.run(
        batchModifyMessagesEffect({
          accountId: ACCOUNT,
          gmailMessageIds: [],
          action: "label",
          labelId: "label-work",
          gmail: gmail.adapter,
        }),
      );

      expect(result).toEqual({ ok: true, action: "label", count: 0 });
      expect(gmail.modifications).toEqual([]);
    });
  });
});
