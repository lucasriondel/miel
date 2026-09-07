// What an inline edit of a saved promo sends (#164).
//
// The rules worth pinning are all here, in the one pure module between the five
// text boxes and the request: a patch names what changed and nothing else, an
// emptied box clears a nullable field, and the expiry crosses as a calendar day
// because a promo expires on a date rather than at an instant.
import { describe, expect, test } from "bun:test";
import type { SavedPromo } from "../../api/types";
import { promoDraft, promoPatch, promoDraftIsSavable } from "./savedPromoDraft";

const promo = (over: Partial<SavedPromo> = {}): SavedPromo => ({
  id: "promo-1",
  accountId: "acc-1",
  accountEmail: "me@example.com",
  gmailMessageId: "mail-1",
  code: "WEEKEND20",
  discount: "20% off",
  terms: "orders over £50, excl. sale",
  expiresAt: "2026-12-24T23:59:59.999Z",
  merchant: "Zara",
  ...over,
});

describe("the draft a row starts editing from", () => {
  test("is what the row was showing", () => {
    expect(promoDraft(promo())).toEqual({
      code: "WEEKEND20",
      discount: "20% off",
      terms: "orders over £50, excl. sale",
      expiresAt: "2026-12-24",
      merchant: "Zara",
    });
  });

  // The stored value is the last instant of the promo's last UTC day, and the
  // box is a date box: read in a local zone it would offer Christmas Day east of
  // Greenwich, which is a day the mail never named.
  test("reads the stored instant as the UTC day it is the end of", () => {
    expect(promoDraft(promo({ expiresAt: "2026-01-01T23:59:59.999Z" })).expiresAt).toBe(
      "2026-01-01",
    );
  });

  // A field the mail never stated is an empty box, not the word "null" or a dash
  // the user would have to delete before typing.
  test("shows an unstated field as an empty box", () => {
    expect(promoDraft(promo({ code: null, terms: null, expiresAt: null, merchant: null }))).toEqual(
      {
        code: "",
        discount: "20% off",
        terms: "",
        expiresAt: "",
        merchant: "",
      },
    );
  });
});

describe("the patch a save sends", () => {
  const draftOf = (over: Partial<ReturnType<typeof promoDraft>> = {}) => ({
    ...promoDraft(promo()),
    ...over,
  });

  // A patch, not a replacement: sending the untouched fields back would make a
  // save from a row loaded five minutes ago overwrite whatever was fixed since.
  test("names only the fields that changed", () => {
    expect(promoPatch(promo(), draftOf({ merchant: "Zara Home" }))).toEqual({
      merchant: "Zara Home",
    });
  });

  test("names several when several changed", () => {
    expect(promoPatch(promo(), draftOf({ code: "SUMMER25", discount: "25% off" }))).toEqual({
      code: "SUMMER25",
      discount: "25% off",
    });
  });

  // Nothing to send is nothing to send — a save that changed nothing must not
  // cost a request.
  test("is null when nothing was touched", () => {
    expect(promoPatch(promo(), draftOf())).toBeNull();
  });

  // An emptied box is the user saying the mail states none, which is a value and
  // not an omission.
  test("clears a nullable field emptied", () => {
    expect(promoPatch(promo(), draftOf({ terms: "", code: "" }))).toEqual({
      terms: null,
      code: null,
    });
  });

  test("says nothing about a field that was empty and stayed empty", () => {
    expect(promoPatch(promo({ terms: null }), draftOf({ terms: "" }))).toBeNull();
  });

  // The expiry goes out as the day someone picked; turning that into the stored
  // end-of-day instant is the server's job, and the same function the extraction
  // writes through does it.
  test("sends an edited expiry as a calendar day", () => {
    expect(promoPatch(promo(), draftOf({ expiresAt: "2026-10-31" }))).toEqual({
      expiresAt: "2026-10-31",
    });
  });

  test("clears an expiry emptied", () => {
    expect(promoPatch(promo(), draftOf({ expiresAt: "" }))).toEqual({ expiresAt: null });
  });

  test("says nothing about an expiry re-picked as the day it already was", () => {
    expect(promoPatch(promo(), draftOf({ expiresAt: "2026-12-24" }))).toBeNull();
  });

  // Whitespace around a value is typing, not an edit.
  test("trims what was typed, and a trimmed value equal to the stored one is no edit", () => {
    expect(promoPatch(promo(), draftOf({ merchant: "  Zara  " }))).toBeNull();
    expect(promoPatch(promo(), draftOf({ merchant: "  Zara Home  " }))).toEqual({
      merchant: "Zara Home",
    });
  });

  // Nothing here can reach the copy of the mail: it is a record, and the patch
  // is built from the five guesses alone.
  test("names none of the saved copy of the mail", () => {
    const patch = promoPatch(promo(), draftOf({ merchant: "Zara Home", discount: "25% off" }))!;
    expect(Object.keys(patch).toSorted()).toEqual(["discount", "merchant"]);
  });
});

// The headline is what makes a row a promo at all, so it is the one field of the
// five that cannot be emptied — refused here, before a request, and refused
// again by the wire schema.
describe("what cannot be saved", () => {
  test("a draft with no discount", () => {
    expect(promoDraftIsSavable({ ...promoDraft(promo()), discount: "" })).toBe(false);
    expect(promoDraftIsSavable({ ...promoDraft(promo()), discount: "   " })).toBe(false);
  });

  test("any draft that still says something", () => {
    expect(promoDraftIsSavable(promoDraft(promo()))).toBe(true);
    // The other four may all be empty at once: an offer with no code, no terms,
    // no stated end and a shop the mail never named is still an offer.
    expect(
      promoDraftIsSavable({
        code: "",
        discount: "20% off",
        terms: "",
        expiresAt: "",
        merchant: "",
      }),
    ).toBe(true);
  });
});
