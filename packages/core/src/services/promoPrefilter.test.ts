import { describe, expect, test } from "bun:test";
import { shouldExtractPromos } from "./promoPrefilter";

// The prefilter is the feature's cost control: every message it accepts costs a
// model call, and every message it rejects is a promo the user never sees. So
// the tests are written as the two mistakes, not as coverage of the signals —
// what must never be accepted (ordinary mail) and what must never be missed (a
// marketing mail carrying a code, in any of the five languages).

describe("mail that is not worth a model call", () => {
  test("a plain personal mail is rejected", () => {
    expect(
      shouldExtractPromos({
        subject: "Thursday?",
        text: "Are we still on for dinner Thursday? I booked the table for eight, but I can move it if Friday works better for you. Bring the book you mentioned.",
      }),
    ).toBe(false);
  });

  // The receipt is the case a currency symbol alone would ruin: every order
  // confirmation in the mailbox carries a price, and none of them carries a
  // promo. A price counts only next to a word that says it is an offer.
  test("a receipt is rejected, price and all", () => {
    expect(
      shouldExtractPromos({
        subject: "Your order has shipped",
        text: "Total: £42.60, charged to the card ending 4242. Track the parcel with the link below.",
      }),
    ).toBe(false);
  });

  // A code is upper case *and* mixed — the acronyms and years that fill work
  // mail are neither, and taking them would accept most of the inbox.
  test("an acronym or a year is not a code", () => {
    expect(
      shouldExtractPromos({
        subject: "NDA and the 2026 roadmap",
        text: "Attached is the PDF. The NDA needs a signature, and the 2026 roadmap review is Tuesday at ten.",
      }),
    ).toBe(false);
  });

  test("a message with nothing in it is rejected", () => {
    expect(shouldExtractPromos({ subject: "   ", text: null })).toBe(false);
    expect(shouldExtractPromos({})).toBe(false);
  });
});

describe("mail that is worth a model call", () => {
  // The language-neutral signal, and the one that carries most marketing mail:
  // a figure and a percent sign, with no vocabulary involved at all.
  test("a percentage is enough on its own", () => {
    expect(
      shouldExtractPromos({
        subject: "Spring styles are here",
        text: "Take 30% today, in store and online.",
      }),
    ).toBe(true);
  });

  // No vocabulary, no percentage, no price: the shape of the run is the whole
  // signal, which is what keeps the module from being an English-only filter.
  test("a bare code-shaped run is enough on its own", () => {
    expect(
      shouldExtractPromos({ subject: "One for you", text: "Enter WELCOME15 at checkout." }),
    ).toBe(true);
  });

  test("a price beside an offer word is enough", () => {
    expect(
      shouldExtractPromos({
        subject: "Weekend edit",
        text: "Special offer: everything in the edit is under £20 until Sunday.",
      }),
    ).toBe(true);
  });

  test("the subject alone can carry the signal", () => {
    expect(shouldExtractPromos({ subject: "Your voucher is waiting", text: null })).toBe(true);
  });
});

// The word lists are written unaccented, so a French, German, Spanish or
// Italian mail only reaches them through the folding — the same `foldAccents`
// the verification-code vocabulary matches with, not a second implementation of
// it. Each of these mails carries a word that is spelled with a diacritic and
// nothing else the module would accept, so folding is what decides them.
describe("promotional wording in the other four languages", () => {
  test("French, through the folded accent", () => {
    expect(
      shouldExtractPromos({
        subject: "Rien que pour vous",
        text: "Votre réduction personnelle vous attend jusqu'à dimanche.",
      }),
    ).toBe(true);
  });

  test("German, through the folded ß", () => {
    expect(
      shouldExtractPromos({
        subject: "Für Sie",
        text: "Sichern Sie sich Ihre Ermäßigung für den nächsten Einkauf.",
      }),
    ).toBe(true);
  });

  test("Spanish, through the folded accent", () => {
    expect(
      shouldExtractPromos({
        subject: "Para ti",
        text: "Tu código promocional te espera hasta el domingo.",
      }),
    ).toBe(true);
  });

  test("Italian", () => {
    expect(
      shouldExtractPromos({
        subject: "Solo per te",
        text: "Il tuo buono sconto ti aspetta fino a domenica.",
      }),
    ).toBe(true);
  });
});
