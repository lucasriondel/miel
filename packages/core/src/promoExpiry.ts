/**
 * How a promo's expiry is stored (#154, #157).
 *
 * A promo expires on a *date*, not at an instant: mail says "ends Sunday", and
 * the shop means the whole of Sunday, wherever the reader happens to be. The
 * column is a `timestamptz` because that is what the schema has, so the rule
 * that makes it behave like a date lives here — the day's last representable
 * UTC instant, written once by whatever puts a row in `promo_codes`.
 *
 * Which way to round is a decided trade: a promo reading expired while the shop
 * still honours it is the annoying failure, and the reverse costs one failed
 * checkout attempt. So the stored instant is the end of the day, never its
 * start.
 */

/** The last millisecond of `date`'s UTC day. */
export function endOfDayUtc(date: Date): Date {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/**
 * A calendar day (`YYYY-MM-DD`) as the instant stored for it.
 *
 * Both ways a deadline gets into the column go through here — the model's
 * answer at extraction time (#159) and a user correcting it afterwards
 * (#164) — so a date someone typed and a date the model read are the same kind
 * of value, and neither can drift into being an instant.
 */
export function promoExpiryInstant(day: string): Date {
  return endOfDayUtc(new Date(`${day}T00:00:00.000Z`));
}
