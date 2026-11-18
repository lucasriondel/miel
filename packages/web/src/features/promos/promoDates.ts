/**
 * The two calendar phrasings the page uses for a mail's own date — the
 * sender's, not a deadline, so these read in the local zone like the inbox does.
 */

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const MONTH_DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const FULL = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const WITH_TIME = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const WEEK_MS = 6 * 86_400_000;

/**
 * When a mail arrived, as a card's meta line says it: the weekday inside the
 * last week ("Sun"), the day otherwise ("Oct 24"), the year only when it is not
 * this one. Null when the date is unknown.
 */
export const mailDayLabel = (iso: string | null, now: Date): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (now.getTime() - date.getTime() < WEEK_MS && date <= now) return WEEKDAY.format(date);
  return date.getFullYear() === now.getFullYear() ? MONTH_DAY.format(date) : FULL.format(date);
};

/** "Oct 27" — when a promo was saved. */
export const savedDayLabel = (iso: string, now: Date): string => {
  const date = new Date(iso);
  return date.getFullYear() === now.getFullYear() ? MONTH_DAY.format(date) : FULL.format(date);
};

/** "Oct 27, 09:14" — the original mail's header line. */
export const mailStampLabel = (iso: string | null): string | null =>
  iso ? WITH_TIME.format(new Date(iso)) : null;
