import { describe, expect, test } from "bun:test";
import { buildRange, startOfPeriod, stepRange } from "../sync/dateRange";
import { periodTitle } from "./periodTitle";

const NOW = new Date(2026, 10, 18, 10, 0);

describe("periodTitle", () => {
  test("names the current and the previous period relative to today", () => {
    for (const mode of ["week", "month", "year"] as const) {
      const current = startOfPeriod(NOW, mode);
      expect(periodTitle(buildRange(current, mode), NOW)).toBe(`This ${mode}`);
      expect(periodTitle(buildRange(stepRange(current, mode, -1), mode), NOW)).toBe(`Last ${mode}`);
    }
  });

  test("names older periods by the calendar", () => {
    expect(periodTitle(buildRange(new Date(2024, 0, 1), "year"), NOW)).toBe("2024");
    expect(periodTitle(buildRange(new Date(2026, 8, 1), "month"), NOW)).toBe("September 2026");
    const older = stepRange(startOfPeriod(NOW, "week"), "week", -3);
    expect(periodTitle(buildRange(older, "week"), NOW)).toMatch(/^Week of [A-Z][a-z]{2} \d+$/);
  });
});
