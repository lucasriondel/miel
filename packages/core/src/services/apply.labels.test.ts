// Attaching and detaching labels, through the store seam (#136) — the first
// behaviour tests the apply service has had.
//
// Two collaborators are faked and neither is a database: the in-memory mailbox
// behind the three stores, and a recording Gmail. What is asserted is the part
// that is genuinely apply's own — that Gmail is told first and the local rows
// only mirror what it accepted, and that a label id from another account names
// nothing.
import { beforeEach, describe, expect, test } from "bun:test";
import { Exit } from "effect";
import { runExit } from "../testkit/runExit";
import { makeRecordingGmail, type RecordingGmail } from "../testkit/gmail";
import { makeTestStores, type TestStores } from "../testkit/stores";
import { applyLabelsEffect } from "./apply";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const OTHER_ACCOUNT = "22222222-2222-4222-8222-222222222222";

let stores: TestStores;
let gmail: RecordingGmail;

beforeEach(() => {
  gmail = makeRecordingGmail();
  stores = makeTestStores({
    mailbox: {
      accounts: [
        { id: ACCOUNT, email: "me@example.com" },
        { id: OTHER_ACCOUNT, email: "other@example.com" },
      ],
      messages: [{ accountId: ACCOUNT, gmailMessageId: "m1" }],
      labels: [
        { id: "label-work", accountId: ACCOUNT, name: "Work", gmailLabelId: "Label_Work" },
        { id: "label-bills", accountId: ACCOUNT, name: "Bills", gmailLabelId: "Label_Bills" },
        {
          id: "label-theirs",
          accountId: OTHER_ACCOUNT,
          name: "Theirs",
          gmailLabelId: "Label_Theirs",
        },
      ],
    },
  });
});

const attachedTo = (gmailMessageId: string) =>
  stores.mailbox.messageLabels
    .filter((ml) => ml.gmailMessageId === gmailMessageId)
    .map((ml) => ml.labelId);

describe("applyLabelsEffect", () => {
  test("tells Gmail once, then mirrors the change onto the message's rows", async () => {
    const result = await stores.run(
      applyLabelsEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        addLabelIds: ["label-work"],
        gmail: gmail.adapter,
      }),
    );

    expect(gmail.modifications).toEqual([
      {
        account: "me@example.com",
        messageIds: ["m1"],
        add: ["Label_Work"],
        remove: undefined,
      },
    ]);
    expect(attachedTo("m1")).toEqual(["label-work"]);
    expect(result.added).toEqual([
      { labelId: "label-work", gmailLabelId: "Label_Work", name: "Work" },
    ]);
    expect(result.removed).toEqual([]);
  });

  test("adds and removes in the one Gmail call", async () => {
    stores.mailbox.add.messageLabel({
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      labelId: "label-bills",
    });

    const result = await stores.run(
      applyLabelsEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        addLabelIds: ["label-work"],
        removeLabelIds: ["label-bills"],
        gmail: gmail.adapter,
      }),
    );

    expect(gmail.modifications).toHaveLength(1);
    expect(gmail.modifications[0]).toMatchObject({
      add: ["Label_Work"],
      remove: ["Label_Bills"],
    });
    expect(attachedTo("m1")).toEqual(["label-work"]);
    expect(result.removed.map((l) => l.name)).toEqual(["Bills"]);
  });

  test("attaching a label twice leaves one row", async () => {
    const apply = () =>
      stores.run(
        applyLabelsEffect({
          accountId: ACCOUNT,
          gmailMessageId: "m1",
          addLabelIds: ["label-work"],
          gmail: gmail.adapter,
        }),
      );

    await apply();
    await apply();

    expect(attachedTo("m1")).toEqual(["label-work"]);
  });

  // A label id is only meaningful inside one account, so an id from another
  // must name nothing here rather than reach across.
  test("ignores a label belonging to a different account", async () => {
    const result = await stores.run(
      applyLabelsEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        addLabelIds: ["label-theirs"],
        gmail: gmail.adapter,
      }),
    );

    expect(result.added).toEqual([]);
    expect(gmail.modifications).toEqual([]);
    expect(attachedTo("m1")).toEqual([]);
  });

  test("does nothing at all when no known label is named", async () => {
    const result = await stores.run(
      applyLabelsEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        addLabelIds: [],
        gmail: gmail.adapter,
      }),
    );

    expect(result).toEqual({ ok: true, added: [], removed: [] });
    expect(gmail.modifications).toEqual([]);
  });

  // Gmail first, rows second: a modification Gmail refused must not leave miel
  // claiming the label is attached.
  test("writes nothing when Gmail refuses the modification", async () => {
    gmail.fails = new Error("gmail said no");

    const exit = await runExit(
      stores.provide(
        applyLabelsEffect({
          accountId: ACCOUNT,
          gmailMessageId: "m1",
          addLabelIds: ["label-work"],
          gmail: gmail.adapter,
        }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(attachedTo("m1")).toEqual([]);
  });

  test("resolves the account by email too, and refuses one it does not know", async () => {
    await stores.run(
      applyLabelsEffect({
        accountEmail: "me@example.com",
        gmailMessageId: "m1",
        addLabelIds: ["label-work"],
        gmail: gmail.adapter,
      }),
    );
    expect(attachedTo("m1")).toEqual(["label-work"]);

    const exit = await runExit(
      stores.provide(
        applyLabelsEffect({
          accountEmail: "nobody@example.com",
          gmailMessageId: "m1",
          addLabelIds: ["label-work"],
          gmail: gmail.adapter,
        }),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
