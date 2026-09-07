// What the Promo Codes page reads (#162), asserted through the rows a caller
// gets back rather than through a query shape.
//
// The store answers one rule, because it is the read model: a saved row is one
// with a `savedAt`, from every account, newest saved first. Everything else is
// the page's and lives in the service — which of the two sections a promo is
// in, the order inside each, and the two things that are deliberately *not*
// done: nothing is deduped and nothing is deleted.
import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { endOfDayUtc } from "../promoExpiry";
import { makeTestStores, type TestStores } from "../testkit/stores";
import type { PromoSeed } from "../testkit/mailbox";
import { listSavedPromosEffect, type SavedPromosPage } from "./promoCodes";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const OTHER_ACCOUNT = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-09-05T12:00:00.000Z");

/** A day, as the extraction stores one: the last instant of that UTC day. */
const expiring = (day: string) => endOfDayUtc(new Date(`${day}T00:00:00.000Z`));

/** One promo the user saved, with the copy of the mail the save took. */
const saved = (id: string, over: Partial<PromoSeed> = {}): PromoSeed => ({
  id,
  accountId: ACCOUNT,
  gmailMessageId: `mail-${id}`,
  discount: "20% off",
  code: "WEEKEND20",
  terms: "orders over £50",
  merchant: "Zara",
  expiresAt: expiring("2026-12-24"),
  savedAt: new Date("2026-09-01T09:00:00.000Z"),
  ...over,
});

const seed = (promos: PromoSeed[]): TestStores =>
  makeTestStores({
    mailbox: {
      accounts: [
        { id: ACCOUNT, email: "me@example.com" },
        { id: OTHER_ACCOUNT, email: "other@example.com" },
      ],
      promos,
    },
  });

const page = (stores: TestStores, now = NOW): Promise<SavedPromosPage> =>
  stores.run(listSavedPromosEffect({ now }));

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("what a saved promo carries", () => {
  test("the promo's own fields, and the mailbox it arrived in", async () => {
    const stores = seed([saved("p1")]);

    const { active } = await page(stores);

    expect(active).toEqual([
      {
        id: "p1",
        accountId: ACCOUNT,
        accountEmail: "me@example.com",
        gmailMessageId: "mail-p1",
        code: "WEEKEND20",
        discount: "20% off",
        terms: "orders over £50",
        expiresAt: expiring("2026-12-24").toISOString(),
        merchant: "Zara",
      },
    ]);
  });

  // The account is a column, never a filter: nobody standing at a till should
  // have to remember which inbox a code came in.
  test("shows every account's promos at once", async () => {
    const stores = seed([saved("mine"), saved("theirs", { accountId: OTHER_ACCOUNT })]);

    const { active } = await page(stores);

    expect(ids(active).toSorted()).toEqual(["mine", "theirs"]);
    expect(active.find((p) => p.id === "theirs")?.accountEmail).toBe("other@example.com");
  });

  test("leaves a detection nobody saved out of the page", async () => {
    const stores = seed([saved("kept"), saved("suggested", { savedAt: null })]);

    const { active, expired } = await page(stores);

    expect(ids([...active, ...expired])).toEqual(["kept"]);
  });
});

describe("the active section", () => {
  test("puts the soonest deadline first", async () => {
    const stores = seed([
      saved("december", { expiresAt: expiring("2026-12-24") }),
      saved("tomorrow", { expiresAt: expiring("2026-09-06") }),
      saved("october", { expiresAt: expiring("2026-10-01") }),
    ]);

    expect(ids((await page(stores)).active)).toEqual(["tomorrow", "october", "december"]);
  });

  // Dated urgency outranks an open-ended offer, and an unstated expiry is never
  // invented — so the no-deadline promos sit at the end of the section.
  test("sorts the promos with no end date last among them", async () => {
    const stores = seed([
      saved("open", { expiresAt: null }),
      saved("december", { expiresAt: expiring("2026-12-24") }),
      saved("alsoOpen", { expiresAt: null }),
    ]);

    expect(ids((await page(stores)).active)).toEqual(["december", "open", "alsoOpen"]);
  });

  // The stored instant is the end of the promo's last UTC day, so a promo
  // lapsing today is still usable for the whole of it.
  test("keeps a promo that lapses today", async () => {
    const stores = seed([saved("today", { expiresAt: expiring("2026-09-05") })]);

    const { active, expired } = await page(stores);

    expect(ids(active)).toEqual(["today"]);
    expect(expired).toEqual([]);
  });
});

describe("the expired section", () => {
  test("holds the lapsed promos, most recently lapsed first", async () => {
    const stores = seed([
      saved("july", { expiresAt: expiring("2026-07-01") }),
      saved("august", { expiresAt: expiring("2026-08-31") }),
      saved("live", { expiresAt: expiring("2026-12-24") }),
    ]);

    const { active, expired } = await page(stores);

    expect(ids(active)).toEqual(["live"]);
    expect(ids(expired)).toEqual(["august", "july"]);
  });

  // Deletion is always something the user chose: the record of what a shop
  // offered outlives the offer.
  test("never deletes what it read", async () => {
    const stores = seed([saved("lapsed", { expiresAt: expiring("2026-07-01") })]);

    await page(stores);

    expect(ids(stores.mailbox.promos)).toEqual(["lapsed"]);
  });
});

// The suggestions section folds a shop's repeated code into one card, because
// three reminder mails are one offer. Two saves are two decisions the user
// made, and the page does not second-guess either of them.
test("a promo saved twice appears twice", async () => {
  const stores = seed([
    saved("first", { code: "WEEKEND20" }),
    saved("second", { code: "WEEKEND20", gmailMessageId: "mail-reminder" }),
  ]);

  expect(ids((await page(stores)).active).toSorted()).toEqual(["first", "second"]);
});
