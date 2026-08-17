// The in-memory mailbox (#136) — the second implementation of the three
// mailbox store contracts, and the one every messages/apply suite runs against.
//
// A fake that answers differently from the real thing is worse than no fake, so
// what is asserted here is the contract itself: the joins a read promises, the
// idempotence an upsert promises, the scoping by account, and an outage that
// stays an outage instead of degrading to "nothing stored".
import { beforeEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { LabelStore, MessageStore, TriageStore } from "../stores/contracts";
import { makeTestStores, type TestStores } from "./stores";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const REF = { accountId: ACCOUNT, gmailMessageId: "m1" };

let stores: TestStores;

beforeEach(() => {
  stores = makeTestStores({
    mailbox: {
      accounts: [
        { id: ACCOUNT, email: "me@example.com" },
        { id: OTHER, email: "other@example.com" },
      ],
      messages: [
        { accountId: ACCOUNT, gmailMessageId: "m1", internalDate: "2026-03-01T09:00:00.000Z" },
        { accountId: ACCOUNT, gmailMessageId: "m2", internalDate: "2026-03-02T09:00:00.000Z" },
      ],
      labels: [{ id: "label-1", accountId: ACCOUNT, name: "Work", gmailLabelId: "Label_Work" }],
      messageLabels: [{ accountId: ACCOUNT, gmailMessageId: "m1", labelId: "label-1" }],
    },
  });
});

describe("the in-memory message store", () => {
  test("fills in the columns a seed leaves out", async () => {
    const detail = await stores.run(MessageStore.detail(REF));

    expect(detail).toMatchObject({
      accountEmail: "me@example.com",
      gmailThreadId: "thread-m1",
      isArchived: false,
      isTrashed: false,
    });
  });

  test("answers null for a message it does not hold", async () => {
    expect(
      await stores.run(MessageStore.detail({ accountId: ACCOUNT, gmailMessageId: "nope" })),
    ).toBeNull();
    expect(
      await stores.run(MessageStore.threadIdOf({ accountId: ACCOUNT, gmailMessageId: "nope" })),
    ).toBeNull();
  });

  test("lists newest first and never more than the limit", async () => {
    const rows = await stores.run(MessageStore.list({ limit: 1 }));

    expect(rows.map((r) => r.gmailMessageId)).toEqual(["m2"]);
  });

  test("joins the label's own columns onto an attachment of it", async () => {
    const rows = await stores.run(MessageStore.labelsFor([REF]));

    expect(rows).toEqual([
      {
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        labelId: "label-1",
        name: "Work",
        gmailLabelId: "Label_Work",
        colorBg: null,
        colorFg: null,
      },
    ]);
  });

  test("reads nothing for no refs, rather than everything", async () => {
    expect(await stores.run(MessageStore.labelsFor([]))).toEqual([]);
    expect(await stores.run(MessageStore.attachmentsFor([]))).toEqual([]);
  });

  test("attaching a label twice leaves one row, and detaching drops it", async () => {
    const attach = () =>
      stores.run(
        MessageStore.attachLabels({
          accountId: ACCOUNT,
          gmailMessageIds: ["m2"],
          labelIds: ["label-1"],
        }),
      );

    await attach();
    await attach();
    expect(stores.mailbox.messageLabels).toHaveLength(2);

    await stores.run(
      MessageStore.detachLabels({
        accountId: ACCOUNT,
        gmailMessageIds: ["m2"],
        labelIds: ["label-1"],
      }),
    );
    expect(stores.mailbox.messageLabels.map((ml) => ml.gmailMessageId)).toEqual(["m1"]);
  });

  test("sets only the flags it is given", async () => {
    await stores.run(
      MessageStore.setFlagsForMessages({
        accountId: ACCOUNT,
        gmailMessageIds: ["m1"],
        flags: { isArchived: true },
      }),
    );

    expect(stores.mailbox.messages[0]).toMatchObject({ isArchived: true, isTrashed: false });
  });
});

describe("the in-memory triage store", () => {
  test("orders a message's history newest first", async () => {
    await stores.run(
      TriageStore.insert({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        priority: "low",
        reasoning: "first",
      }),
    );
    await stores.run(
      TriageStore.insert({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        priority: "high",
        reasoning: "second",
      }),
    );

    const history = await stores.run(TriageStore.historyFor(REF));

    expect(history.map((t) => t.reasoning)).toEqual(["second", "first"]);
  });

  test("reads no suggestions for no triages", async () => {
    expect(await stores.run(TriageStore.existingSuggestionsFor([]))).toEqual([]);
    expect(await stores.run(TriageStore.newSuggestionsFor([]))).toEqual([]);
  });
});

describe("the in-memory label store", () => {
  test("scopes every lookup to one account", async () => {
    expect(await stores.run(LabelStore.byIds({ accountId: OTHER, ids: ["label-1"] }))).toEqual([]);
    expect(
      await stores.run(LabelStore.byGmailIds({ accountId: OTHER, gmailLabelIds: ["Label_Work"] })),
    ).toEqual([]);
    expect(await stores.run(LabelStore.byName({ accountId: OTHER, name: "Work" }))).toBeNull();
    expect(await stores.run(LabelStore.byAccount(ACCOUNT))).toHaveLength(1);
  });

  test("upserts on the Gmail id: a second sync updates rather than duplicates", async () => {
    const [updated] = await stores.run(
      LabelStore.upsert([
        {
          accountId: ACCOUNT,
          gmailLabelId: "Label_Work",
          name: "Work renamed",
          type: "user",
          colorBg: "#111",
          colorFg: "#eee",
        },
      ]),
    );

    expect(updated.id).toBe("label-1");
    expect(stores.mailbox.labels).toHaveLength(1);
    expect(stores.mailbox.labels[0]).toMatchObject({ name: "Work renamed", colorBg: "#111" });
  });

  test("gives a brand-new label an id of its own", async () => {
    const [created] = await stores.run(
      LabelStore.upsert([
        {
          accountId: ACCOUNT,
          gmailLabelId: "Label_New",
          name: "New",
          type: "user",
          colorBg: null,
          colorFg: null,
        },
      ]),
    );

    expect(created.id).not.toBe("label-1");
    expect(await stores.run(LabelStore.byName({ accountId: ACCOUNT, name: "New" }))).toEqual(
      created,
    );
  });
});

// An unreachable mailbox is an outage: a read that answered "nothing here"
// would show an operator an empty inbox instead of an error.
describe("an offline mailbox", () => {
  test("fails reads and writes rather than answering empty", async () => {
    stores.mailbox.offline = true;

    const read = await Effect.runPromise(
      Effect.exit(stores.provide(MessageStore.list({ limit: 5 }))),
    );
    expect(read._tag).toBe("Failure");

    const write = await Effect.runPromise(
      Effect.exit(
        stores.provide(
          MessageStore.attachLabels({
            accountId: ACCOUNT,
            gmailMessageIds: ["m2"],
            labelIds: ["label-1"],
          }),
        ),
      ),
    );
    expect(write._tag).toBe("Failure");
    expect(stores.mailbox.messageLabels).toHaveLength(1);
  });
});
