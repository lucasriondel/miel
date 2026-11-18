/**
 * How a promo states its deadline (#160, #162).
 *
 * `expiresAt` is stored as the last instant of the promo's last UTC day, and is
 * a date rather than an instant: the shop that said "ends Sunday" means the
 * whole of Sunday. So the formatter is pinned to UTC — read in a local zone,
 * `2026-12-24T23:59:59.999Z` would show as Christmas Day east of Greenwich and
 * the card would name a day the mail never did.
 *
 * A mail that stated no deadline gets none: the extraction is told never to
 * guess a date, and a card that implied one would undo that.
 */
const DAY_FMT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** How a mail with no stated deadline is described, wherever it is shown. */
export const NO_EXPIRY_LABEL = "No end date";

/**
 * The day alone — for the page's table (#162), where the column is already
 * headed "Expires" and a cell repeating the word would say it twice.
 */
export function promoExpiryDate(expiresAt: string | null): string {
  if (expiresAt === null) return NO_EXPIRY_LABEL;
  return DAY_FMT.format(new Date(expiresAt));
}

/** The whole sentence — for a card, which has no column heading to lean on. */
export function promoExpiryLabel(expiresAt: string | null): string {
  if (expiresAt === null) return NO_EXPIRY_LABEL;
  return `Expires ${promoExpiryDate(expiresAt)}`;
}

/**
 * How near a deadline is — what the expiry pill on a row and on the ticket
 * shows (`miel.figcraft`, Promo codes).
 *
 * - `soon`: today, tomorrow or within a week — "4 days left", drawn amber.
 * - `normal`: further off — "Ends Nov 12".
 * - `ended`: the day has passed — "Ended Sep 30", greyed.
 * - `none`: the mail stated no deadline — "No end date", never an invented one.
 *
 * Days are counted between UTC calendar days, for the reason the formatter is
 * pinned to UTC: the stored value is the last instant of a day, and the day is
 * what the shop meant. `now` is a parameter so the answer is assertable.
 */
export type PromoExpiryTone = "soon" | "normal" | "ended" | "none";

export interface PromoExpiryState {
  tone: PromoExpiryTone;
  label: string;
}

const DAY_MS = 86_400_000;
const SOON_DAYS = 7;

const SHORT_FMT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const utcDay = (date: Date): number =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/** "Nov 12", or "Nov 12, 2027" when the day is not in the current year. */
const shortDay = (date: Date, now: Date): string =>
  date.getUTCFullYear() === now.getUTCFullYear() ? SHORT_FMT.format(date) : DAY_FMT.format(date);

export function promoExpiryState(expiresAt: string | null, now: Date): PromoExpiryState {
  if (expiresAt === null) return { tone: "none", label: NO_EXPIRY_LABEL };
  const end = new Date(expiresAt);
  const days = Math.round((utcDay(end) - utcDay(now)) / DAY_MS);
  if (days < 0) return { tone: "ended", label: `Ended ${shortDay(end, now)}` };
  if (days === 0) return { tone: "soon", label: "Ends today" };
  if (days === 1) return { tone: "soon", label: "Ends tomorrow" };
  if (days <= SOON_DAYS) return { tone: "soon", label: `${days} days left` };
  return { tone: "normal", label: `Ends ${shortDay(end, now)}` };
}
