// Reading the mail a saved promo came from (#163), asserted through what a
// caller gets back.
//
// The one rule worth a suite: the copy is what is read. `markSaved` denormalised
// subject, sender, date and both bodies onto the row precisely because the Gmail
// original was trashed in the same gesture and will be purged from its trash
// thirty days later — so this read must answer with a `messages` row that says
// something else, and with no `messages` row at all.
import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { makeTestStores, type TestStores } from "../testkit/stores";
import type { MessageSeed, PromoSeed } from "../testkit/mailbox";
import { readSavedPromoMailEffect, type SavedPromoMail } from "./promoCodes";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const SAVED_AT = new Date("2026-09-01T09:00:00.000Z");
const RECEIVED = new Date("2026-08-30T07:30:00.000Z");

/** A promo the user saved, with the copy of the mail the save took. */
const saved = (over: Partial<PromoSeed> = {}): PromoSeed => ({
  id: "p1",
  accountId: ACCOUNT,
  gmailMessageId: "mail-1",
  discount: "20% off",
  code: "WEEKEND20",
  savedAt: SAVED_AT,
  subject: "Your 20% weekend",
  fromName: "Zara",
  fromEmail: "newsletter@email.zara.com",
  internalDate: RECEIVED,
  bodyHtml: "<p>WEEKEND20 — 20% off, ends Sunday</p>",
  bodyText: "WEEKEND20 — 20% off, ends Sunday",
  ...over,
});

const seed = (promos: PromoSeed[], messages: MessageSeed[] = []): TestStores =>
  makeTestStores({
    mailbox: {
      accounts: [{ id: ACCOUNT, email: "me@example.com" }],
      messages,
      promos,
    },
  });

const read = (stores: TestStores, id = "p1"): Promise<SavedPromoMail | null> =>
  stores.run(readSavedPromoMailEffect({ id }));

describe("what the read answers", () => {
  test("the mail as the save recorded it", async () => {
    const stores = seed([saved()]);

    expect(await read(stores)).toEqual({
      id: "p1",
      subject: "Your 20% weekend",
      fromName: "Zara",
      fromEmail: "newsletter@email.zara.com",
      internalDate: RECEIVED.toISOString(),
      bodyHtml: "<p>WEEKEND20 — 20% off, ends Sunday</p>",
      bodyText: "WEEKEND20 — 20% off, ends Sunday",
    });
  });

  // The point of the denormalisation: the Gmail original was trashed by the
  // save, and Gmail purges its own trash. A read that went back to `messages`
  // would answer nothing exactly when the copy is the only version left.
  test("the mail is still there when the message row is gone", async () => {
    const stores = seed([saved()]);
    expect(stores.mailbox.messages).toEqual([]);

    expect((await read(stores))?.bodyHtml).toBe("<p>WEEKEND20 — 20% off, ends Sunday</p>");
  });

  // Same rule from the other side: a message row that still exists and says
  // something else does not get a word in.
  test("the copy wins over the message row it was taken from", async () => {
    const stores = seed(
      [saved()],
      [
        {
          accountId: ACCOUNT,
          gmailMessageId: "mail-1",
          subject: "Rewritten since",
          bodyHtml: "<p>not this</p>",
          bodyText: "not this",
        },
      ],
    );

    const mail = await read(stores);
    expect(mail?.subject).toBe("Your 20% weekend");
    expect(mail?.bodyText).toBe("WEEKEND20 — 20% off, ends Sunday");
  });

  test("a mail that carried no body at all is answered as one", async () => {
    const stores = seed([saved({ bodyHtml: null, bodyText: null })]);

    expect(await read(stores)).toMatchObject({ bodyHtml: null, bodyText: null });
  });
});

describe("what has no mail to answer with", () => {
  // The copy is written at save time and at no other moment, so a detection
  // nobody acted on has none — there is nothing to show and nothing to invent.
  test("a detection nobody saved", async () => {
    const stores = seed([saved({ savedAt: null, subject: null, bodyHtml: null, bodyText: null })]);

    expect(await read(stores)).toBeNull();
  });

  test("an id that is nobody's promo", async () => {
    const stores = seed([saved()]);

    expect(await read(stores, "p-nobody")).toBeNull();
  });
});

// A read is a read: the row it answered from is the row it found.
test("changes nothing about the promo", async () => {
  const stores = seed([saved()]);
  const before = { ...stores.mailbox.promos[0]! };

  await read(stores);

  expect(stores.mailbox.promos).toEqual([before]);
});
