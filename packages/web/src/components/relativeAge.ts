/**
 * The age of a message, in the inbox row's own vocabulary: `19d`, `4h`, `now`.
 *
 * The row's end cell is a fixed 5.75rem box shared with the hover actions
 * (`MessageRowEndCell`), so the date has to fit that width at every age a
 * mailbox contains. `formatDistanceToNow` does not — "about 19 days ago" is
 * several times the cell — and a date that overflows its cell is a date nobody
 * reads, which is how the indicators came to look absent.
 *
 * So the unit is a single letter and the number is bare, the way the design's
 * rows spell it. Each step hands over once the next unit can be written as a
 * whole number, and a year is the last one: beyond that the row stops counting
 * and says `1y+`, since the exact age of something that old is not what the
 * reader is scanning for.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

export const relativeAge = (date: Date, now: Date = new Date()): string => {
  const elapsed = now.getTime() - date.getTime();
  if (Number.isNaN(elapsed)) return "";
  // A clock skewed forward — the server's date ahead of the browser's — is
  // still "just arrived" to the reader, not a negative age.
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < YEAR) return `${Math.floor(elapsed / DAY)}d`;
  return "1y+";
};
