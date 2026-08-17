/** Calendar period the inbox pager steps through. `all` has no period. */
export type RangeMode = "week" | "month";

export interface DateRange {
  /** Period start, 00:00 local time (Monday for `week`, the 1st for `month`). */
  start: Date;
  /** Start of the *next* period, 00:00 local time (exclusive). */
  end: Date;
  /** YYYY-MM-DD for `start`. */
  key: string;
  mode: RangeMode;
}

const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Snaps `d` back to the start of its week (Monday) or month, at 00:00 local. */
export function startOfPeriod(d: Date, mode: RangeMode): Date {
  if (mode === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = out.getDay(); // 0 = Sunday
  out.setDate(out.getDate() + (day === 0 ? -6 : 1 - day));
  return out;
}

/** Moves `start` by `n` whole periods. Month steps are calendar months, not 30d. */
export function stepRange(start: Date, mode: RangeMode, n: number): Date {
  return mode === "month"
    ? new Date(start.getFullYear(), start.getMonth() + n, 1)
    : new Date(start.getFullYear(), start.getMonth(), start.getDate() + n * 7);
}

export function toRangeKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Reads a YYYY-MM-DD URL key back into a period start. Returns null for
 * anything malformed or not a real calendar date, so the caller can fall
 * back to the current period.
 */
export function parseRangeKey(key: string | null, mode: RangeMode): Date | null {
  if (!key) return null;
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const d = new Date(year, month, day);
  // Rejects overflow like 2026-02-30, which Date silently rolls forward.
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
    return null;
  }
  return startOfPeriod(d, mode);
}

export function buildRange(start: Date, mode: RangeMode): DateRange {
  const from = startOfPeriod(start, mode);
  return { start: from, end: stepRange(from, mode, 1), key: toRangeKey(from), mode };
}

const DAY_FMT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const MONTH_FMT = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const YEAR_FMT = new Intl.DateTimeFormat(undefined, { year: "numeric" });

/** Human label for the pager: "Jun 15 – Jun 21, 2026" or "June 2026". */
export function formatRangeLabel(range: DateRange): string {
  if (range.mode === "month") return MONTH_FMT.format(range.start);
  // `end` is exclusive, so the last day shown is the day before it.
  const last = new Date(range.end);
  last.setDate(last.getDate() - 1);
  const left = DAY_FMT.format(range.start);
  const right = DAY_FMT.format(last);
  const endYear = YEAR_FMT.format(last);
  return range.start.getFullYear() === last.getFullYear()
    ? `${left} – ${right}, ${endYear}`
    : `${left}, ${YEAR_FMT.format(range.start)} – ${right}, ${endYear}`;
}
