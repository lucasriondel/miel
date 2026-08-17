import { describe, expect, test } from "bun:test";
import {
  buildRange,
  formatRangeLabel,
  parseRangeKey,
  startOfPeriod,
  stepRange,
  type RangeMode,
} from "./dateRange";

describe("startOfPeriod", () => {
  test("week snaps back to Monday", () => {
    // 2026-06-17 is a Wednesday.
    expect(startOfPeriod(new Date(2026, 5, 17), "week")).toEqual(new Date(2026, 5, 15));
    // Monday itself is a fixed point.
    expect(startOfPeriod(new Date(2026, 5, 15), "week")).toEqual(new Date(2026, 5, 15));
    // Sunday belongs to the week that started six days earlier.
    expect(startOfPeriod(new Date(2026, 5, 21), "week")).toEqual(new Date(2026, 5, 15));
  });

  test("month snaps back to the 1st", () => {
    expect(startOfPeriod(new Date(2026, 5, 17), "month")).toEqual(new Date(2026, 5, 1));
    expect(startOfPeriod(new Date(2026, 5, 1), "month")).toEqual(new Date(2026, 5, 1));
    expect(startOfPeriod(new Date(2026, 0, 31), "month")).toEqual(new Date(2026, 0, 1));
  });

  test("drops the time of day", () => {
    expect(startOfPeriod(new Date(2026, 5, 17, 23, 45, 12), "month")).toEqual(new Date(2026, 5, 1));
  });
});

describe("buildRange", () => {
  test("week ends on the following Monday (exclusive)", () => {
    const range = buildRange(new Date(2026, 5, 15), "week");
    expect(range.start).toEqual(new Date(2026, 5, 15));
    expect(range.end).toEqual(new Date(2026, 5, 22));
    expect(range.key).toBe("2026-06-15");
    expect(range.mode).toBe("week");
  });

  test("month ends on the 1st of the next month (exclusive)", () => {
    const range = buildRange(new Date(2026, 5, 3), "month");
    expect(range.start).toEqual(new Date(2026, 5, 1));
    expect(range.end).toEqual(new Date(2026, 6, 1));
    expect(range.key).toBe("2026-06-01");
  });

  test("month rolls the year over in December", () => {
    const range = buildRange(new Date(2026, 11, 20), "month");
    expect(range.start).toEqual(new Date(2026, 11, 1));
    expect(range.end).toEqual(new Date(2027, 0, 1));
  });

  test("normalizes a mid-period date to the period start", () => {
    expect(buildRange(new Date(2026, 5, 17), "week").start).toEqual(new Date(2026, 5, 15));
  });
});

describe("stepRange", () => {
  test("week steps by seven days in both directions", () => {
    expect(stepRange(new Date(2026, 5, 15), "week", -1)).toEqual(new Date(2026, 5, 8));
    expect(stepRange(new Date(2026, 5, 15), "week", 1)).toEqual(new Date(2026, 5, 22));
  });

  test("month steps by one calendar month, not 30 days", () => {
    expect(stepRange(new Date(2026, 1, 1), "month", -1)).toEqual(new Date(2026, 0, 1));
    expect(stepRange(new Date(2026, 1, 1), "month", 1)).toEqual(new Date(2026, 2, 1));
  });

  test("month steps across year boundaries", () => {
    expect(stepRange(new Date(2026, 0, 1), "month", -1)).toEqual(new Date(2025, 11, 1));
    expect(stepRange(new Date(2026, 11, 1), "month", 1)).toEqual(new Date(2027, 0, 1));
  });
});

describe("parseRangeKey", () => {
  test("parses a well-formed key and snaps it to the period start", () => {
    expect(parseRangeKey("2026-06-17", "week")).toEqual(new Date(2026, 5, 15));
    expect(parseRangeKey("2026-06-17", "month")).toEqual(new Date(2026, 5, 1));
  });

  test("rejects null and malformed keys", () => {
    expect(parseRangeKey(null, "week")).toBeNull();
    expect(parseRangeKey("", "week")).toBeNull();
    expect(parseRangeKey("2026-6-1", "week")).toBeNull();
    expect(parseRangeKey("not-a-date", "month")).toBeNull();
  });

  test("rejects an out-of-range calendar date", () => {
    expect(parseRangeKey("2026-13-01", "month")).toBeNull();
    expect(parseRangeKey("2026-02-30", "month")).toBeNull();
  });
});

const label = (start: Date, mode: RangeMode) => formatRangeLabel(buildRange(start, mode));

describe("formatRangeLabel", () => {
  test("week inside one year shows both endpoints once", () => {
    expect(label(new Date(2026, 5, 15), "week")).toBe("Jun 15 – Jun 21, 2026");
  });

  test("week spanning a year boundary spells both years", () => {
    // Mon Dec 28, 2026 → Sun Jan 3, 2027.
    expect(label(new Date(2026, 11, 28), "week")).toBe("Dec 28, 2026 – Jan 3, 2027");
  });

  test("month renders as month + year, no day numbers", () => {
    expect(label(new Date(2026, 5, 1), "month")).toBe("June 2026");
    expect(label(new Date(2027, 0, 1), "month")).toBe("January 2027");
  });
});
