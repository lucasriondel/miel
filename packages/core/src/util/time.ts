const SINCE_PATTERN = /^(\d+)([dhwmy])$/i;

export function parseSince(since: string): string {
  const trimmed = since.trim();
  if (!SINCE_PATTERN.test(trimmed)) {
    throw new Error(`Invalid --since value: "${since}". Expected forms like "7d", "24h", "2w".`);
  }
  return `newer_than:${trimmed.toLowerCase()} -in:sent -in:trash`;
}

export interface DateRange {
  from: string;
  to: string;
}

function toGmailDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

const SINCE_UNIT_MS: Record<string, number> = {
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  m: 30 * 24 * 60 * 60 * 1000,
  y: 365 * 24 * 60 * 60 * 1000,
};

export interface ResolvedSyncRange {
  from: Date;
  /**
   * The window the *query* actually covers, and so the only window a caller may
   * conclude "Gmail did not return this ⇒ it is gone" over. For a range sync
   * that is not the `to` the caller asked for: the query is written in calendar
   * dates and `before:` excludes its own date, so the last day requested is
   * never searched. Narrowed to the start of that date here so a reconcile
   * cannot soft-remove messages Gmail was never asked about.
   */
  to: Date;
  query: string;
}

/** Start of `d`'s UTC calendar day — the instant `before:toGmailDate(d)` cuts at. */
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function resolveSyncRange(opts: {
  since?: string;
  range?: DateRange;
  now?: Date;
}): ResolvedSyncRange {
  const now = opts.now ?? new Date();
  if (opts.range) {
    const from = new Date(opts.range.from);
    const query = buildRangeQuery(opts.range);
    // `before:` is exclusive on the calendar date, so the search stops at the
    // start of `to`'s UTC day. Report that, not the requested `to`, which would
    // put a whole unsearched day inside the reconcile window (#150).
    const to = startOfUtcDay(new Date(opts.range.to));
    return { from, to, query };
  }
  const since = (opts.since ?? "7d").trim();
  const match = SINCE_PATTERN.exec(since);
  if (!match) {
    throw new Error(`Invalid --since value: "${since}". Expected forms like "7d", "24h", "2w".`);
  }
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const ms = SINCE_UNIT_MS[unit];
  if (!ms) throw new Error(`Unsupported --since unit: "${unit}"`);
  const from = new Date(now.getTime() - n * ms);
  return { from, to: now, query: parseSince(since) };
}

export function buildRangeQuery(range: DateRange): string {
  const from = new Date(range.from);
  const to = new Date(range.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error(`Invalid date range: ${JSON.stringify(range)}`);
  }
  if (to.getTime() <= from.getTime()) {
    throw new Error(
      `Invalid date range: "to" must be after "from" (got ${range.from} → ${range.to})`,
    );
  }
  // Gmail's `after:` is inclusive on the calendar date and `before:` is
  // exclusive, both in user-local time. UTC dates are a close enough proxy
  // for our weekly window and avoid TZ drift on the server.
  return `after:${toGmailDate(from)} before:${toGmailDate(to)} -in:sent -in:trash`;
}
