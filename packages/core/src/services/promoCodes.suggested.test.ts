// What the Promo Codes page's third section is handed (#154) — the detections
// the inbox section's cap left out, which is the only place they are reachable.
//
// The inbox section and this read share every rule but two: this one names no
// account, because the page is global, and it is not capped, because a cap that
// hid rows here would hide them everywhere. Asserted through the rows a caller
// reads back, never through a query shape.
import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { endOfDayUtc } from "../promoExpiry";
import { makeTestStores, type TestStores } from "../testkit/stores";
import type { MailboxSeed, PromoSeed } from "../testkit/mailbox";
import { MAX_PROMO_SUGGESTIONS, listSuggestedPromosEffect, type PromoListing } from "./promoCodes";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const OTHER_ACCOUNT = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-09-05T12:00:00.000Z");

/** A day, as the extraction stores one: the last instant of that UTC day. */
const expiring = (day: string) => endOfDayUtc(new Date(`${day}T00:00:00.000Z`));

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

const suggested = (stores: TestStores, now: Date = NOW): Promise<PromoListing[]> =>
  stores.run(listSuggestedPromosEffect({ now }));

describe("the suggestions the Promo Codes page reads", () => {
  test("carries the five guesses and the mailbox the mail arrived in", async () => {
    const stores = seed([detection("p1")]);

    expect(await suggested(stores)).toEqual([
      {
        id: "p1",
        accountId: ACCOUNT,
        accountEmail: "me@example.com",
        gmailMessageId: "mail-p1",
        code: "WEEKEND20",
        discount: "20% off",
        terms: "orders over £50",
        merchant: "Zara",
        expiresAt: expiring("2026-12-24").toISOString(),
      },
    ]);
  });

  // The page is global, like the saved sections above it: a promo code is used
  // at a checkout, so which mailbox it arrived in is a column and never a gate.
  test("answers every account's detections, each naming its own mailbox", async () => {
    const stores = seed([
      detection("mine", { code: "MINE" }),
      detection("theirs", { code: "THEIRS", accountId: OTHER_ACCOUNT }),
    ]);

    const rows = await suggested(stores);
    expect(rows.map((p) => p.code).toSorted()).toEqual(["MINE", "THEIRS"]);
    expect(rows.find((p) => p.code === "THEIRS")?.accountEmail).toBe("other@example.com");
  });

  // The reason this read exists. The inbox section shows six cards so a heavy
  // newsletter week does not push the list off the screen; the rest have to be
  // somewhere, and this is where.
  test("is not capped, so a heavy week's detections past the inbox's cap are here", async () => {
    const many = Array.from({ length: MAX_PROMO_SUGGESTIONS + 4 }, (_, i) =>
      detection(`p${i}`, { code: `CODE${i}` }),
    );
    const stores = seed(many);

    expect(await suggested(stores)).toHaveLength(MAX_PROMO_SUGGESTIONS + 4);
  });

  test("leaves out an expired detection, and keeps one with no stated end", async () => {
    const stores = seed([
      detection("lapsed", { code: "GONE", expiresAt: expiring("2026-09-04") }),
      detection("today", { code: "LAST", expiresAt: expiring("2026-09-05") }),
      detection("open", { code: "OPEN", expiresAt: null }),
    ]);

    expect((await suggested(stores)).map((p) => p.code).toSorted()).toEqual(["LAST", "OPEN"]);
  });

  // One shop's three reminder mails are one offer, here as in the inbox: this
  // section is the same read model, not a second one with its own answers.
  test("folds a repeated code into one row, keeping the newest mail's", async () => {
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

    const rows = await suggested(stores);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.gmailMessageId).toBe("mail-b");
  });

  // A saved promo is a saved promo: it left the suggestions the moment it was
  // saved, and the sections below it are where it lives now.
  test("never answers a promo somebody already saved", async () => {
    const stores = seed([detection("kept", { code: "KEPT" })]);
    const saved = detection("saved", { code: "SAVED", gmailMessageId: "mail-saved" });
    stores.mailbox.add.message({
      accountId: ACCOUNT,
      gmailMessageId: "mail-saved",
      internalDate: new Date("2026-09-01T09:00:00.000Z"),
    });
    stores.mailbox.add.promo({ ...saved.promo, savedAt: new Date("2026-09-02T09:00:00.000Z") });

    expect((await suggested(stores)).map((p) => p.code)).toEqual(["KEPT"]);
  });

  test("newest mail first, so the freshest offer is read first", async () => {
    const stores = seed([
      detection("older", {
        code: "OLDER",
        internalDate: new Date("2026-09-01T09:00:00.000Z"),
      }),
      detection("newer", {
        code: "NEWER",
        internalDate: new Date("2026-09-04T09:00:00.000Z"),
      }),
    ]);

    expect((await suggested(stores)).map((p) => p.code)).toEqual(["NEWER", "OLDER"]);
  });
});
