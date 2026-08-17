// Attaching labels and accepting a triage's suggestions, through the store seam
// (#136) — the first behaviour tests the apply service has had.
//
// Two collaborators are faked and neither is a database: the in-memory mailbox
// behind the three stores, and a recording Gmail. What is asserted is the part
// that is genuinely apply's own — that Gmail is told first and the local rows
// only mirror what it accepted, that a label id from another account names
// nothing, and that an accepted suggestion ends up both attached and marked.
import { beforeEach, describe, expect, test } from "bun:test";
import { Exit } from "effect";
import { runExit } from "../testkit/runExit";
import { makeRecordingGmail, type RecordingGmail } from "../testkit/gmail";
import { makeTestStores, type TestStores } from "../testkit/stores";
import { applyLabelsEffect, applySuggestionsEffect } from "./apply";

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

describe("applySuggestionsEffect", () => {
  beforeEach(() => {
    stores.mailbox.add.triage({
      id: "t1",
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      priority: "high",
      reasoning: "because",
      model: null,
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
    });
    stores.mailbox.add.existingSuggestion({
      triageId: "t1",
      labelId: "label-work",
      status: "pending",
    });
    stores.mailbox.add.newSuggestion({
      suggestionId: "s1",
      triageId: "t1",
      name: "Receipts",
      reasoning: null,
      status: "pending",
      createdLabelId: null,
    });
  });

  test("accepting an existing label attaches it and marks the suggestion applied", async () => {
    const result = await stores.run(
      applySuggestionsEffect({
        triageId: "t1",
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        acceptExistingLabelIds: ["label-work"],
        gmail: gmail.adapter,
      }),
    );

    expect(result.appliedExistingLabelIds).toEqual(["label-work"]);
    expect(result.attached).toEqual([{ gmailLabelId: "Label_Work", name: "Work" }]);
    expect(attachedTo("m1")).toEqual(["label-work"]);
    expect(stores.mailbox.existingSuggestions[0].status).toBe("applied");
  });

  test("accepting a brand-new label creates it in Gmail, stores it and attaches it", async () => {
    const result = await stores.run(
      applySuggestionsEffect({
        triageId: "t1",
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        acceptNewSuggestionIds: ["s1"],
        gmail: gmail.adapter,
      }),
    );

    expect(gmail.createdLabels).toEqual(["Receipts"]);
    const created = stores.mailbox.labels.find((l) => l.name === "Receipts");
    expect(created).toBeDefined();
    expect(result.createdLabels).toEqual([
      { suggestionId: "s1", labelId: created!.id, name: "Receipts" },
    ]);
    expect(attachedTo("m1")).toEqual([created!.id]);
    // The suggestion now points at the label it produced, so it is not offered
    // again and the row says which label it became.
    expect(stores.mailbox.newSuggestions[0]).toMatchObject({
      status: "applied",
      createdLabelId: created!.id,
    });
  });

  test("adopts a label of that name that already exists rather than making a second", async () => {
    stores.mailbox.add.label({
      id: "label-receipts",
      accountId: ACCOUNT,
      name: "Receipts",
      gmailLabelId: "Label_Receipts",
    });

    const result = await stores.run(
      applySuggestionsEffect({
        triageId: "t1",
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        acceptNewSuggestionIds: ["s1"],
        gmail: gmail.adapter,
      }),
    );

    expect(gmail.createdLabels).toEqual([]);
    expect(result.createdLabels).toEqual([
      { suggestionId: "s1", labelId: "label-receipts", name: "Receipts" },
    ]);
    expect(stores.mailbox.labels.filter((l) => l.name === "Receipts")).toHaveLength(1);
  });

  test("attaches both kinds in one Gmail call when both are accepted", async () => {
    await stores.run(
      applySuggestionsEffect({
        triageId: "t1",
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        acceptExistingLabelIds: ["label-work"],
        acceptNewSuggestionIds: ["s1"],
        gmail: gmail.adapter,
      }),
    );

    const attach = gmail.modifications.at(-1)!;
    expect(attach.messageIds).toEqual(["m1"]);
    expect(attach.add).toHaveLength(2);
    expect(attachedTo("m1")).toHaveLength(2);
  });

  test("leaves a suggestion that was not accepted pending", async () => {
    await stores.run(
      applySuggestionsEffect({
        triageId: "t1",
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        acceptExistingLabelIds: ["label-work"],
        gmail: gmail.adapter,
      }),
    );

    expect(stores.mailbox.newSuggestions[0].status).toBe("pending");
  });

  test("ignores a suggestion id belonging to another triage", async () => {
    stores.mailbox.add.triage({
      id: "t2",
      accountId: ACCOUNT,
      gmailMessageId: "m1",
      priority: "low",
      reasoning: "because",
      model: null,
      createdAt: new Date("2026-03-01T11:00:00.000Z"),
    });
    stores.mailbox.add.newSuggestion({
      suggestionId: "s2",
      triageId: "t2",
      name: "Elsewhere",
      reasoning: null,
      status: "pending",
      createdLabelId: null,
    });

    const result = await stores.run(
      applySuggestionsEffect({
        triageId: "t1",
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        acceptNewSuggestionIds: ["s2"],
        gmail: gmail.adapter,
      }),
    );

    expect(result.createdLabels).toEqual([]);
    expect(gmail.createdLabels).toEqual([]);
    expect(stores.mailbox.newSuggestions.find((s) => s.suggestionId === "s2")?.status).toBe(
      "pending",
    );
  });

  test("refuses a triage that is not stored", async () => {
    const exit = await runExit(
      stores.provide(
        applySuggestionsEffect({
          triageId: "44444444-4444-4444-8444-444444444444",
          accountId: ACCOUNT,
          gmailMessageId: "m1",
          acceptExistingLabelIds: ["label-work"],
          gmail: gmail.adapter,
        }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(attachedTo("m1")).toEqual([]);
  });

  // The triage id and the message id both come from the client, so a mismatched
  // pair would otherwise mark one message's suggestions from another's page.
  test("refuses a triage that belongs to a different message", async () => {
    stores.mailbox.add.message({ accountId: ACCOUNT, gmailMessageId: "m2" });

    const exit = await runExit(
      stores.provide(
        applySuggestionsEffect({
          triageId: "t1",
          accountId: ACCOUNT,
          gmailMessageId: "m2",
          acceptExistingLabelIds: ["label-work"],
          gmail: gmail.adapter,
        }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(stores.mailbox.existingSuggestions[0].status).toBe("pending");
  });
});
