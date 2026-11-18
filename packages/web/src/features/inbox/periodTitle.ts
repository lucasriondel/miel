import { startOfPeriod, stepRange, type DateRange } from "../sync/dateRange";

/**
 * The inbox's display title (Main view › List header: "This week"): the period
 * on screen named relative to today where that reads naturally — "This week",
 * "Last month" — and by its calendar name further back ("Week of Oct 19",
 * "September 2026", "2024"). The pill beside it carries the exact dates.
 */
export const periodTitle = (range: DateRange, now: Date = new Date()): string => {
  const current = startOfPeriod(now, range.mode).getTime();
  const previous = stepRange(startOfPeriod(now, range.mode), range.mode, -1).getTime();
  const start = range.start.getTime();
  if (start === current) return `This ${range.mode}`;
  if (start === previous) return `Last ${range.mode}`;
  if (range.mode === "year") return String(range.start.getFullYear());
  if (range.mode === "month") {
    return range.start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return `Week of ${range.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
};
