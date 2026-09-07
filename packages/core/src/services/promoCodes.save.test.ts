// Saving a promo and trashing its mail, in that order (#161).
//
// The ordering is the whole reason this is a service rather than a click
// handler, so it is what these tests are about: the save is written first, and
// a trash Gmail refuses leaves the promo saved. The reverse order would allow
// trash-succeeds-then-save-fails, which deletes the mail and loses the code —
// the one failure a user cannot recover from.
//
// Asserted through the rows a caller reads back and through what Gmail was
// asked to do, with the in-memory mailbox and the recording adapter.
import { beforeEach, describe, expect, test } from "bun:test";
import { Exit } from "effect";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { makeRecordingGmail, type RecordingGmail } from "../testkit/gmail";
import { runExit } from "../testkit/runExit";
import { makeTestStores, type TestStores } from "../testkit/stores";
import { listPromoSuggestionsEffect, savePromoEffect } from "./promoCodes";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const SAVED_AT = new Date("2026-09-05T12:00:00.000Z");
const RECEIVED = new Date("2026-09-01T09:00:00.000Z");

let stores: TestStores;
let gmail: RecordingGmail;

beforeEach(() => {
  gmail = makeRecordingGmail();
  stores = makeTestStores({
    mailbox: {
      accounts: [{ id: ACCOUNT, email: "me@example.com" }],
      messages: [
        {
          accountId: ACCOUNT,
          gmailMessageId: "mail-1",
          gmailThreadId: "thread-a",
          subject: "Weekend only: 20% off",
          fromName: "Zara",
          fromEmail: "newsletter@email.zara.com",
          internalDate: RECEIVED,
          bodyHtml: "<p>Use <b>WEEKEND20</b></p>",
          bodyText: "Use WEEKEND20",
        },
        // A sibling of the same thread, so "Gmail trashes threads" stays true.
        { accountId: ACCOUNT, gmailMessageId: "mail-2", gmailThreadId: "thread-a" },
      ],
      promos: [
        {
          id: "p1",
          accountId: ACCOUNT,
          gmailMessageId: "mail-1",
          code: "WEEKEND20",
          discount: "20% off",
          terms: "orders over £50",
          merchant: "Zara",
        },
      ],
    },
  });
});

const promoRow = () => stores.mailbox.promos.find((p) => p.id === "p1")!;
const messageRow = (id: string) => stores.mailbox.messages.find((m) => m.gmailMessageId === id)!;

const save = (id = "p1", adapter = gmail.adapter) =>
  stores.run(savePromoEffect({ id, gmail: adapter, now: SAVED_AT }));

describe("savePromoEffect", () => {
  test("saves the promo and trashes the mail's thread in Gmail", async () => {
    const result = await save();

    expect(result).toEqual({ ok: true, id: "p1", trashedThreadId: "thread-a" });
    expect(promoRow().savedAt).toEqual(SAVED_AT);
    expect(gmail.trashed).toEqual([{ account: "me@example.com", threadId: "thread-a" }]);
    expect(messageRow("mail-1").isTrashed).toBe(true);
    expect(messageRow("mail-2").isTrashed).toBe(true);
  });

  // The copy is the point of saving: the Gmail original is on its way to the
  // trash, so this is the only version of the mail the user will ever see.
  test("writes the denormalised copy of the mail, which outlives the message's flags", async () => {
    await save();

    expect(promoRow()).toMatchObject({
      subject: "Weekend only: 20% off",
      fromName: "Zara",
      fromEmail: "newsletter@email.zara.com",
      internalDate: RECEIVED,
      bodyHtml: "<p>Use <b>WEEKEND20</b></p>",
      bodyText: "Use WEEKEND20",
    });
    // Written before the trash, and unmoved by it.
    expect(messageRow("mail-1").isTrashed).toBe(true);
  });

  // The single most important test in the feature. A failed trash costs the
  // user a mail they delete by hand; a failed save after a successful trash
  // would cost them the code with the mail already gone.
  test("keeps the promo saved when Gmail refuses the trash", async () => {
    gmail.fails = new Error("gmail said no");

    const result = await save();

    expect(result).toEqual({ ok: true, id: "p1", trashedThreadId: null });
    expect(promoRow().savedAt).toEqual(SAVED_AT);
    expect(promoRow().subject).toBe("Weekend only: 20% off");
    // The mailbox is untouched, which is what makes it recoverable by hand.
    expect(messageRow("mail-1").isTrashed).toBe(false);
  });

  // Not "both happened" but "the save happened first": read at the moment Gmail
  // is asked, the row is already saved.
  test("has already saved the row by the time Gmail is asked to trash", async () => {
    const savedWhenAsked: (Date | null)[] = [];
    const adapter = {
      ...gmail.adapter,
      trashThread: async (o: { account: string; threadId: string }) => {
        savedWhenAsked.push(promoRow().savedAt);
        return gmail.adapter.trashThread(o);
      },
    };

    await save("p1", adapter);

    expect(savedWhenAsked).toEqual([SAVED_AT]);
  });

  test("refuses an id no promo has, and trashes nothing", async () => {
    const exit = await runExit(
      stores.provide(savePromoEffect({ id: "nope", gmail: gmail.adapter, now: SAVED_AT })),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(gmail.trashed).toEqual([]);
  });

  // A promo saved twice is still one row, and the record it kept is the one it
  // was saved with — the mail is a record, not a field that follows the mailbox.
  test("leaves an already-saved promo's record alone and still trashes the mail", async () => {
    await save();
    stores.mailbox.messages.find((m) => m.gmailMessageId === "mail-1")!.isTrashed = false;

    const result = await stores.run(
      savePromoEffect({
        id: "p1",
        gmail: gmail.adapter,
        now: new Date("2027-01-01T00:00:00.000Z"),
      }),
    );

    expect(result.ok).toBe(true);
    expect(stores.mailbox.promos.filter((p) => p.id === "p1")).toHaveLength(1);
    expect(promoRow().savedAt).toEqual(SAVED_AT);
  });
});

describe("a saved promo", () => {
  test("no longer appears among the suggestions", async () => {
    const before = await stores.run(
      listPromoSuggestionsEffect({ accountId: ACCOUNT, now: SAVED_AT }),
    );
    expect(before.map((p) => p.id)).toEqual(["p1"]);

    await save();

    const after = await stores.run(
      listPromoSuggestionsEffect({ accountId: ACCOUNT, now: SAVED_AT }),
    );
    expect(after).toEqual([]);
  });
});
