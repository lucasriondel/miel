const SINCE_PATTERN = /^(\d+)([dhwmy])$/i;

export function parseSince(since: string): string {
  const trimmed = since.trim();
  if (!SINCE_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid --since value: "${since}". Expected forms like "7d", "24h", "2w".`,
    );
  }
  return `newer_than:${trimmed.toLowerCase()} -in:sent`;
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
  return `after:${toGmailDate(from)} before:${toGmailDate(to)} -in:sent`;
}
