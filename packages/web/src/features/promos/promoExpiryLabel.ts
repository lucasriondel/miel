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
