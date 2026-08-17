import { expect, test, describe } from "bun:test";
import { periodLabel, yearToRange } from "./useSyncPeriod";

describe("periodLabel", () => {
  test("returns the since token for preset periods", () => {
    expect(periodLabel({ kind: "preset", since: "7d" })).toBe("7d");
    expect(periodLabel({ kind: "preset", since: "30d" })).toBe("30d");
    expect(periodLabel({ kind: "preset", since: "1y" })).toBe("1y");
  });

  test("year period renders the bare 4-digit year", () => {
    expect(periodLabel({ kind: "year", year: 2024 })).toBe("2024");
    expect(periodLabel({ kind: "year", year: 2022 })).toBe("2022");
  });

  test("same-month range collapses to a single month token", () => {
    expect(periodLabel({ kind: "range", from: "2026-06-01", to: "2026-06-10" })).toBe("Jun 1–10");
    expect(periodLabel({ kind: "range", from: "2026-01-15", to: "2026-01-25" })).toBe("Jan 15–25");
  });

  test("cross-month range spells both months", () => {
    expect(periodLabel({ kind: "range", from: "2026-05-30", to: "2026-06-05" })).toBe(
      "May 30 – Jun 5",
    );
  });

  test("cross-year range up to 31 days keeps day precision", () => {
    expect(periodLabel({ kind: "range", from: "2025-12-30", to: "2026-01-05" })).toBe(
      "Dec 30, 2025 – Jan 5, 2026",
    );
  });

  test("wide cross-year range (>31 days) collapses to Mon YYYY – Mon YYYY", () => {
    // "Jan 1, 2025 – Jun 17, 2026" is the verbose case that wraps the TopBar.
    expect(periodLabel({ kind: "range", from: "2025-01-01", to: "2026-06-17" })).toBe(
      "Jan 2025 – Jun 2026",
    );
  });

  test("wide same-year range (>31 days) collapses to Mon – Mon YYYY", () => {
    expect(periodLabel({ kind: "range", from: "2026-01-15", to: "2026-06-17" })).toBe(
      "Jan – Jun 2026",
    );
  });

  test("near the boundary, cross-month ≤31 days keeps the verbose form", () => {
    // Jan 1 → Feb 1 is exactly 31 days; "Jan 1 – Feb 1" is short enough.
    expect(periodLabel({ kind: "range", from: "2026-01-01", to: "2026-02-01" })).toBe(
      "Jan 1 – Feb 1",
    );
    // One day more tips into the compact form.
    expect(periodLabel({ kind: "range", from: "2026-01-01", to: "2026-02-02" })).toBe(
      "Jan – Feb 2026",
    );
  });

  test("falls back gracefully on malformed dates", () => {
    expect(periodLabel({ kind: "range", from: "not-a-date", to: "also-bad" })).toBe(
      "not-a-date–also-bad",
    );
  });
});

describe("yearToRange", () => {
  test("past year returns Jan 1 → Dec 31", () => {
    // today is 2026-07-01
    const today = new Date(2026, 6, 1);
    expect(yearToRange(2024, today)).toEqual({ from: "2024-01-01", to: "2024-12-31" });
    expect(yearToRange(2022, today)).toEqual({ from: "2022-01-01", to: "2022-12-31" });
  });

  test("current year caps `to` at today (local)", () => {
    const today = new Date(2026, 6, 1); // Jul 1, 2026
    expect(yearToRange(2026, today)).toEqual({ from: "2026-01-01", to: "2026-07-01" });
  });

  test("future year (edge) still yields Jan 1 → Dec 31 (kept as-typed, no clamp)", () => {
    const today = new Date(2026, 6, 1);
    expect(yearToRange(2027, today)).toEqual({ from: "2027-01-01", to: "2027-12-31" });
  });
});
