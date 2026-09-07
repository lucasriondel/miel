import { toRangeKey, type DateRange } from "./dateRange";

/**
 * The window a sync request carries for the period the inbox is showing (#152).
 *
 * Date-only on purpose. The server parses these as UTC midnight and hands them
 * to Gmail's `after:`/`before:`, which are calendar dates themselves — so a
 * local calendar day survives the trip, which an ISO instant would not.
 *
 * `to` is the period's *exclusive* end, the day after its last: `before:` is
 * exclusive, so naming the last day would drop it.
 *
 * And a sync must not ask Gmail for dates that have not happened yet, so a
 * period still running is cut at tomorrow — the exclusive end of today. That is
 * one rule for all three periods: the current year stops at today rather than
 * December 31st, and so do the current month and week. The cut only applies
 * where it lands inside the period, so a period entirely in the future (only
 * reachable by hand-editing the URL — the pager refuses to step there) is left
 * alone rather than inverted into a range the API would reject.
 */
export function syncWindow(range: DateRange, now: Date): { from: string; to: string } {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const inside = tomorrow > range.start && tomorrow < range.end;
  return { from: toRangeKey(range.start), to: toRangeKey(inside ? tomorrow : range.end) };
}
