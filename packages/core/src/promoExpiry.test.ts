// The one rule the expiry column carries (#157): a stored expiry is a date, and
// a date is its own last instant in UTC.
import { describe, expect, test } from "bun:test";
import { endOfDayUtc, promoExpiryInstant } from "./promoExpiry";

describe("endOfDayUtc", () => {
  test("takes an instant inside a day to that day's last millisecond", () => {
    expect(endOfDayUtc(new Date("2026-06-30T09:15:00.000Z")).toISOString()).toBe(
      "2026-06-30T23:59:59.999Z",
    );
  });

  test("leaves an end-of-day instant where it is, so storing twice is storing once", () => {
    const already = new Date("2026-06-30T23:59:59.999Z");
    expect(endOfDayUtc(already)).toEqual(already);
  });

  test("keeps a midnight on its own day rather than rounding to the one before", () => {
    expect(endOfDayUtc(new Date("2026-06-30T00:00:00.000Z")).toISOString()).toBe(
      "2026-06-30T23:59:59.999Z",
    );
  });

  test("does not mutate the date it is given", () => {
    const arrived = new Date("2026-06-30T09:15:00.000Z");
    endOfDayUtc(arrived);
    expect(arrived.toISOString()).toBe("2026-06-30T09:15:00.000Z");
  });
});

// Both ways a deadline reaches the column go through this: the model's answer at
// extraction time (#159) and a user correcting it afterwards (#164). One
// function, so a date someone typed and a date the model read cannot become
// different kinds of value.
describe("promoExpiryInstant", () => {
  test("stores a calendar day as the last instant of it", () => {
    expect(promoExpiryInstant("2026-10-31").toISOString()).toBe("2026-10-31T23:59:59.999Z");
  });

  // The day is read in UTC and nowhere else: a deadline entered west of
  // Greenwich must not be stored as the day before.
  test("reads the day in UTC, whatever zone it was typed in", () => {
    expect(promoExpiryInstant("2026-01-01").toISOString()).toBe("2026-01-01T23:59:59.999Z");
    expect(promoExpiryInstant("2026-12-31").toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });
});
