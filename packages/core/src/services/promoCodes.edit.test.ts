// Correcting a saved promo's extracted fields, and removing one (#164).
//
// The five fields are the model's guesses on deliberately slippery marketing
// prose, so all five are corrigible: locking any subset guarantees the locked
// one is the field the model got wrong. What sits beside them — the copy of the
// mail the save took — is a record, and nothing here writes it.
//
// Both acts are the *saved* promo's. A detection nobody acted on has no edit
// affordance anywhere, and removing one would be a dismissal — a different act,
// with a different meaning, that this feature does not have.
import { beforeEach, describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import type { PromoSeed } from "../testkit/mailbox";
import { makeTestStores, type TestStores } from "../testkit/stores";
import {
  deleteSavedPromoEffect,
  listSavedPromosEffect,
  readSavedPromoMailEffect,
  updateSavedPromoEffect,
  type PromoFieldsPatch,
} from "./promoCodes";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const SAVED_AT = new Date("2026-09-01T09:00:00.000Z");
const NOW = new Date("2026-09-05T12:00:00.000Z");

const saved = (over: Partial<PromoSeed> = {}): PromoSeed => ({
  id: "p1",
  accountId: ACCOUNT,
  gmailMessageId: "mail-1",
  code: "WEEKEND20",
  discount: "20% off",
  terms: "orders over £50, excl. sale",
  expiresAt: new Date("2026-12-24T23:59:59.999Z"),
  merchant: "Zara",
  savedAt: SAVED_AT,
  subject: "Your 20% weekend",
  fromName: "Zara",
  fromEmail: "newsletter@email.zara.com",
  internalDate: new Date("2026-08-30T07:30:00.000Z"),
  bodyHtml: "<p>WEEKEND20 — 20% off, ends Sunday</p>",
  bodyText: "WEEKEND20 — 20% off, ends Sunday",
  ...over,
});

let stores: TestStores;

const seed = (promos: PromoSeed[]) => {
  stores = makeTestStores({
    mailbox: { accounts: [{ id: ACCOUNT, email: "me@example.com" }], promos },
  });
};

beforeEach(() => seed([saved()]));

const row = (id = "p1") => stores.mailbox.promos.find((p) => p.id === id)!;
const edit = (fields: PromoFieldsPatch, id = "p1") =>
  stores.run(updateSavedPromoEffect({ id, fields }));
const remove = (id = "p1") => stores.run(deleteSavedPromoEffect({ id }));

describe("editing the extracted fields", () => {
  test("answers the promo as it now stands", async () => {
    expect(await edit({ code: "SUMMER25", discount: "25% off" })).toEqual({
      id: "p1",
      code: "SUMMER25",
      discount: "25% off",
      terms: "orders over £50, excl. sale",
      expiresAt: "2026-12-24T23:59:59.999Z",
      merchant: "Zara",
    });
  });

  // A patch, not a replacement: the editor sends what the user changed, so a
  // field it does not name is the field nobody touched.
  test("writes the fields it names and leaves the rest as stored", async () => {
    await edit({ merchant: "Zara Home" });

    expect(row()).toMatchObject({
      merchant: "Zara Home",
      code: "WEEKEND20",
      discount: "20% off",
      terms: "orders over £50, excl. sale",
    });
  });

  // The other half of "it is a patch": null is how a nullable field is cleared,
  // which is what an emptied text box means.
  test("clears a nullable field named null", async () => {
    const updated = await edit({ terms: null, code: null });

    expect(updated).toMatchObject({ terms: null, code: null });
    expect(row()).toMatchObject({ terms: null, code: null });
  });

  test("a patch that names nothing changes nothing", async () => {
    const before = { ...row() };

    await edit({});

    expect(row()).toEqual(before);
  });

  // An expiry is a date and never an instant — the shop that said "ends Sunday"
  // means the whole of Sunday — so an edited one is stored exactly the way an
  // extracted one is: the last instant of that UTC day.
  test("stores an edited expiry at the end of the day it names", async () => {
    const updated = await edit({ expiresAt: "2026-10-31" });

    expect(row().expiresAt).toEqual(new Date("2026-10-31T23:59:59.999Z"));
    expect(updated?.expiresAt).toBe("2026-10-31T23:59:59.999Z");
  });

  // An unstated expiry is not an expired one, so clearing the date is a promo
  // with no stated end rather than one that lapsed at the epoch.
  test("clears an expiry named null", async () => {
    await edit({ expiresAt: null });

    expect(row().expiresAt).toBeNull();
    const page = await stores.run(listSavedPromosEffect({ now: NOW }));
    expect(page.active.map((p) => p.id)).toEqual(["p1"]);
  });

  // The extracted fields are the guesses; the mail beside them is the record.
  test("never touches the copy of the mail", async () => {
    await edit({ code: "SUMMER25", discount: "25% off", terms: null, merchant: "Someone else" });

    expect(await stores.run(readSavedPromoMailEffect({ id: "p1" }))).toMatchObject({
      subject: "Your 20% weekend",
      fromName: "Zara",
      bodyHtml: "<p>WEEKEND20 — 20% off, ends Sunday</p>",
    });
  });

  // Which section a promo is in is the page's read, computed from the row — so
  // correcting a date the model misread moves it, with nothing else to update.
  test("an edited expiry moves the promo between the page's sections", async () => {
    await edit({ expiresAt: "2026-08-31" });

    const page = await stores.run(listSavedPromosEffect({ now: NOW }));
    expect(page.active).toEqual([]);
    expect(page.expired.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("what has nothing to edit", () => {
  // A detection nobody saved is not on the page, has no edit affordance, and
  // answers the same nothing an unknown id does — the boundary above turns both
  // into one 404.
  test("a detection nobody saved", async () => {
    seed([saved({ savedAt: null })]);

    expect(await edit({ code: "NOPE" })).toBeNull();
    expect(row().code).toBe("WEEKEND20");
  });

  test("an id that is nobody's promo", async () => {
    expect(await edit({ code: "NOPE" }, "p-nobody")).toBeNull();
    expect(row().code).toBe("WEEKEND20");
  });
});

describe("deleting a saved promo", () => {
  test("takes the row, and the page no longer lists it", async () => {
    expect(await remove()).toBe(true);

    expect(stores.mailbox.promos).toEqual([]);
    expect(await stores.run(listSavedPromosEffect({ now: NOW }))).toEqual({
      active: [],
      expired: [],
    });
  });

  // Nothing expires itself off this page: a lapsed promo is the record of what
  // a shop offered, and only the user takes it away.
  test("takes an expired promo the same way", async () => {
    seed([saved({ expiresAt: new Date("2026-07-01T23:59:59.999Z") })]);

    expect(await remove()).toBe(true);
    expect(stores.mailbox.promos).toEqual([]);
  });

  test("takes one row only", async () => {
    seed([saved(), saved({ id: "p2", gmailMessageId: "mail-2" })]);

    await remove("p2");

    expect(stores.mailbox.promos.map((p) => p.id)).toEqual(["p1"]);
  });

  // Removing a suggestion would be a dismissal — a different act with a
  // different meaning, which this feature does not have.
  test("leaves a detection nobody saved where it is", async () => {
    seed([saved({ savedAt: null })]);

    expect(await remove()).toBe(false);
    expect(stores.mailbox.promos.map((p) => p.id)).toEqual(["p1"]);
  });

  test("an id that is nobody's promo takes nothing", async () => {
    expect(await remove("p-nobody")).toBe(false);
    expect(stores.mailbox.promos.map((p) => p.id)).toEqual(["p1"]);
  });
});
