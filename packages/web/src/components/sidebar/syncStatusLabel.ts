/**
 * The sidebar footer's line about the last sync, in two lengths: the full
 * sidebar says "Synced 2 min ago", the rail only "2m ago".
 *
 * Pure over `now` so the wording is assertable. A mailbox never synced says so
 * rather than inventing an age.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const age = (elapsed: number, short: boolean): string => {
  if (elapsed < MINUTE) return short ? "now" : "just now";
  if (elapsed < HOUR) {
    const m = Math.floor(elapsed / MINUTE);
    return short ? `${m}m ago` : `${m} min ago`;
  }
  if (elapsed < DAY) {
    const h = Math.floor(elapsed / HOUR);
    return short ? `${h}h ago` : `${h} h ago`;
  }
  const d = Math.floor(elapsed / DAY);
  return short ? `${d}d ago` : `${d} ${d === 1 ? "day" : "days"} ago`;
};

export const syncStatusLabel = (lastSyncedAt: string | null, now: Date, short = false): string => {
  if (!lastSyncedAt) return short ? "never" : "Not synced yet";
  const elapsed = Math.max(0, now.getTime() - new Date(lastSyncedAt).getTime());
  if (Number.isNaN(elapsed)) return short ? "never" : "Not synced yet";
  const when = age(elapsed, short);
  return short ? when : `Synced ${when}`;
};
