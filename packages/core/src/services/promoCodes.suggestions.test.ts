// What the inbox's suggestions section is handed (#160), asserted through the
// rows a caller reads back rather than through a query shape.
//
// The store already answers the three rules that are storage's: unsaved only,
// one account, and the mailbox rule — a detection whose mail was archived,
// trashed or removed follows it out. What is asserted here is what the *service*
// decides on top of that: an expired promo is not a suggestion, one shop's
// nagging is one card, and the section is capped so a heavy newsletter week
// cannot push the inbox off the screen.
import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { endOfDayUtc } from "../promoExpiry";
import { makeTestStores, type TestStores } from "../testkit/stores";
import type { MailboxSeed, PromoSeed } from "../testkit/mailbox";
import { listPromoSuggestionsEffect, type PromoSuggestion } from "./promoCodes";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const OTHER_ACCOUNT = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-09-05T12:00:00.000Z");

/** A day, as the extraction stores one: the last instant of that UTC day. */
const expiring = (day: string) => endOfDayUtc(new Date(`${day}T00:00:00.000Z`));

/**
 * One suggestion and the mail it hangs off, seeded the way the extraction left
 * them — an unsaved row keyed to a message that is still in the inbox.
 */
const detection = (
  id: string,
  over: Partial<PromoSeed> & { internalDate?: Date } = {},
): { promo: PromoSeed; message: MailboxSeed["messages"] } => {
  const gmailMessageId = (over.gmailMessageId as string) ?? `mail-${id}`;
  const accountId = (over.accountId as string) ?? ACCOUNT;
  return {
    promo: {
      id,
      accountId,
      gmailMessageId,
      discount: "20% off",
      code: "WEEKEND20",
      terms: "orders over £50",
      merchant: "Zara",
      expiresAt: expiring("2026-12-24"),
      ...over,
    },
    message: [
      {
        accountId,
        gmailMessageId,
        subject: "Weekend sale",
        fromName: "Zara",
        fromEmail: "news@zara.example",
        internalDate: over.internalDate ?? new Date("2026-09-01T09:00:00.000Z"),
      },
    ],
  };
};

const seed = (detections: ReturnType<typeof detection>[]): TestStores =>
  makeTestStores({
    mailbox: {
      accounts: [
        { id: ACCOUNT, email: "me@example.com" },
        { id: OTHER_ACCOUNT, email: "other@example.com" },
      ],
      messages: detections.flatMap((d) => d.message ?? []),
      promos: detections.map((d) => d.promo),
    },
  });

const suggestions = (
  stores: TestStores,
  args: { internalDateFrom?: string; internalDateTo?: string; now?: Date } = {},
): Promise<PromoSuggestion[]> =>
  stores.run(listPromoSuggestionsEffect({ accountId: ACCOUNT, now: NOW, ...args }));

describe("the suggestions the inbox section reads", () => {
  test("carries the four fields a card shows, the code, and the mail it came from", async () => {
    const stores = seed([detection("p1")]);

    expect(await suggestions(stores)).toEqual([
      {
        id: "p1",
        accountId: ACCOUNT,
        gmailMessageId: "mail-p1",
        code: "WEEKEND20",
        discount: "20% off",
        terms: "orders over £50",
        merchant: "Zara",
        expiresAt: expiring("2026-12-24").toISOString(),
        subject: "Weekend sale",
        fromName: "Zara",
        fromEmail: "news@zara.example",
        internalDate: "2026-09-01T09:00:00.000Z",
      },
    ]);
  });

  test("answers nothing at all when the account has no detections", async () => {
    const stores = seed([]);

    expect(await suggestions(stores)).toEqual([]);
  });

  // The section's age rule is the promo's own expiry, not the mail's age: a
  // three-week-old code good until Christmas is still worth a card, and one
  // that lapsed yesterday is not.
  test("hides an expired promo and keeps one whose expiry is months away", async () => {
    const stores = seed([
      detection("lapsed", { code: "GONE", expiresAt: expiring("2026-09-04") }),
      detection("distant", {
        code: "XMAS",
        expiresAt: expiring("2026-12-24"),
        internalDate: new Date("2026-08-15T09:00:00.000Z"),
      }),
    ]);

    expect((await suggestions(stores)).map((p) => p.code)).toEqual(["XMAS"]);
  });

  // End-of-day UTC, so the last day is a whole day: the shop still honours it.
  test("keeps a promo expiring today", async () => {
    const stores = seed([detection("today", { code: "LAST", expiresAt: expiring("2026-09-05") })]);

    expect((await suggestions(stores)).map((p) => p.code)).toEqual(["LAST"]);
  });

  test("keeps a promo the mail stated no expiry for", async () => {
    const stores = seed([detection("open", { code: "OPEN", expiresAt: null })]);

    expect((await suggestions(stores)).map((p) => p.code)).toEqual(["OPEN"]);
  });

  // Each mail is its own row, so a shop's reminder carries its own copy of the
  // code rather than being folded into the first mail's.
  test("answers the same code once per message it came in", async () => {
    const stores = seed([
      detection("first", {
        gmailMessageId: "mail-a",
        internalDate: new Date("2026-09-03T09:00:00.000Z"),
      }),
      detection("reminder", {
        gmailMessageId: "mail-b",
        internalDate: new Date("2026-09-04T09:00:00.000Z"),
      }),
    ]);

    expect((await suggestions(stores)).map((p) => p.gmailMessageId).toSorted()).toEqual([
      "mail-a",
      "mail-b",
    ]);
  });

  // A promo belongs to its row, so a cap would leave some rows without theirs.
  test("is not capped", async () => {
    const many = Array.from({ length: 10 }, (_, i) => detection(`p${i}`, { code: `CODE${i}` }));
    const stores = seed(many);

    expect(await suggestions(stores)).toHaveLength(10);
  });

  test("passes the period to the store rather than answering the whole mailbox", async () => {
    const stores = seed([
      detection("inside", {
        code: "INSIDE",
        internalDate: new Date("2026-09-03T09:00:00.000Z"),
      }),
      detection("before", {
        code: "BEFORE",
        internalDate: new Date("2026-08-03T09:00:00.000Z"),
      }),
    ]);

    const rows = await suggestions(stores, {
      internalDateFrom: "2026-09-01T00:00:00.000Z",
      internalDateTo: "2026-10-01T00:00:00.000Z",
    });
    expect(rows.map((p) => p.code)).toEqual(["INSIDE"]);
  });

  test("never answers another account's detections", async () => {
    const stores = seed([
      detection("mine", { code: "MINE" }),
      detection("theirs", { code: "THEIRS", accountId: OTHER_ACCOUNT }),
    ]);

    expect((await suggestions(stores)).map((p) => p.code)).toEqual(["MINE"]);
  });

  // Storage's rule, restated at this level because it is what the section
  // promises: unsaved detections follow their mail, and saving is what makes a
  // promo outlive it.
  test("drops a detection whose mail has been trashed, and a saved one", async () => {
    const stores = seed([detection("kept", { code: "KEPT" })]);
    const trashed = detection("trashed", { code: "TRASHED", gmailMessageId: "mail-gone" });
    const saved = detection("saved", { code: "SAVED", gmailMessageId: "mail-saved" });
    stores.mailbox.add.message({
      accountId: ACCOUNT,
      gmailMessageId: "mail-gone",
      isTrashed: true,
      internalDate: new Date("2026-09-01T09:00:00.000Z"),
    });
    stores.mailbox.add.message({
      accountId: ACCOUNT,
      gmailMessageId: "mail-saved",
      internalDate: new Date("2026-09-01T09:00:00.000Z"),
    });
    stores.mailbox.add.promo(trashed.promo);
    stores.mailbox.add.promo({ ...saved.promo, savedAt: new Date("2026-09-02T09:00:00.000Z") });

    expect((await suggestions(stores)).map((p) => p.code)).toEqual(["KEPT"]);
  });
});
