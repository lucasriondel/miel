import { describe, expect, test } from "bun:test";
import { buildRange } from "./dateRange";
import { syncWindow } from "./syncWindow";

const windowFor = (start: Date, mode: "week" | "month" | "year", now: Date) =>
  syncWindow(buildRange(start, mode), now);

// Jul 1, 2026 — inside the current year, month and week for the cases below.
const NOW = new Date(2026, 6, 1, 14, 30);

describe("a period that has already ended", () => {
  test("a week runs to the following Monday, exclusive", () => {
    expect(windowFor(new Date(2026, 5, 15), "week", NOW)).toEqual({
      from: "2026-06-15",
      to: "2026-06-22",
    });
  });

  test("a month runs to the 1st of the next", () => {
    expect(windowFor(new Date(2026, 2, 14), "month", NOW)).toEqual({
      from: "2026-03-01",
      to: "2026-04-01",
    });
  });

  test("a past year runs to the next January 1st — no day is dropped", () => {
    // The last day of the period is included because `to` is the exclusive end;
    // "2024-12-31" would have asked Gmail for `before:2024/12/31` and lost it.
    expect(windowFor(new Date(2024, 5, 17), "year", NOW)).toEqual({
      from: "2024-01-01",
      to: "2025-01-01",
    });
  });
});

describe("a period still running is cut at today", () => {
  test("the current year stops at today, not at December 31st", () => {
    expect(windowFor(NOW, "year", NOW)).toEqual({ from: "2026-01-01", to: "2026-07-02" });
  });

  test("the current month stops there too", () => {
    expect(windowFor(NOW, "month", NOW)).toEqual({ from: "2026-07-01", to: "2026-07-02" });
  });

  test("the current week stops there too", () => {
    // Wed Jul 1, 2026 — the week began Monday the 29th of June.
    expect(windowFor(NOW, "week", NOW)).toEqual({ from: "2026-06-29", to: "2026-07-02" });
  });

  test("the cut includes today whatever the time of day", () => {
    const justBeforeMidnight = new Date(2026, 6, 1, 23, 59, 59);
    expect(windowFor(justBeforeMidnight, "year", justBeforeMidnight).to).toBe("2026-07-02");
  });

  test("on the period's last day nothing is cut", () => {
    // Dec 31 of the current year: tomorrow *is* the period's end.
    const newYearsEve = new Date(2026, 11, 31, 9, 0);
    expect(windowFor(newYearsEve, "year", newYearsEve)).toEqual({
      from: "2026-01-01",
      to: "2027-01-01",
    });
  });
});

describe("a future period", () => {
  test("is left whole rather than inverted", () => {
    // Only reachable by hand-editing the URL; the API rejects `to` <= `from`.
    expect(windowFor(new Date(2030, 0, 1), "year", NOW)).toEqual({
      from: "2030-01-01",
      to: "2031-01-01",
    });
  });
});
