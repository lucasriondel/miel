// A promo expires on a *date*, not at an instant — the shop means the whole of
// Sunday, wherever the reader is — so the stored value is the last instant of
// that UTC day and the card must read it back as that day.
//
// The assertions are locale-independent on purpose: what is being pinned is
// which day the instant belongs to, not how a given machine spells a month.
import { describe, expect, test } from "bun:test";
import { promoExpiryLabel, promoExpiryState } from "./promoExpiryLabel";

const CHRISTMAS_EVE_END = "2026-12-24T23:59:59.999Z";

describe("how a card states a promo's expiry", () => {
  test("reads the stored end-of-day instant as that UTC day, not the next", () => {
    expect(promoExpiryLabel(CHRISTMAS_EVE_END)).toBe(promoExpiryLabel("2026-12-24T00:00:00.000Z"));
    expect(promoExpiryLabel(CHRISTMAS_EVE_END)).not.toBe(
      promoExpiryLabel("2026-12-25T12:00:00.000Z"),
    );
  });

  test("names the day", () => {
    expect(promoExpiryLabel(CHRISTMAS_EVE_END)).toContain("24");
  });

  // A mail that stated no deadline must never be shown one — the extraction is
  // told never to guess a date, and the card must not undo that by implying one.
  test("says there is no end date rather than inventing one", () => {
    expect(promoExpiryLabel(null)).toBe("No end date");
  });
});

const endOf = (day: string) => `${day}T23:59:59.999Z`;

describe("how near a promo's deadline is", () => {
  const now = new Date("2026-11-18T15:00:00.000Z");

  test("counts the days left inside a week", () => {
    expect(promoExpiryState(endOf("2026-11-22"), now)).toEqual({
      tone: "soon",
      label: "4 days left",
    });
  });

  test("names today and tomorrow", () => {
    expect(promoExpiryState(endOf("2026-11-18"), now).label).toBe("Ends today");
    expect(promoExpiryState(endOf("2026-11-19"), now).label).toBe("Ends tomorrow");
  });

  test("names the day once it is more than a week off", () => {
    const state = promoExpiryState(endOf("2026-12-24"), now);
    expect(state.tone).toBe("normal");
    expect(state.label).toStartWith("Ends ");
    expect(state.label).toContain("24");
  });

  test("says when a lapsed promo ended", () => {
    const state = promoExpiryState(endOf("2026-09-30"), now);
    expect(state.tone).toBe("ended");
    expect(state.label).toStartWith("Ended ");
  });

  test("states no deadline the mail never gave", () => {
    expect(promoExpiryState(null, now)).toEqual({ tone: "none", label: "No end date" });
  });
});
