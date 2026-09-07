import type { PromoFieldsPatch, SavedPromo } from "../../api/types";

/**
 * The five extracted fields as text boxes hold them (#164).
 *
 * All five, and that is the point rather than a convenience: they are the
 * model's guesses on deliberately slippery marketing prose, so locking any
 * subset guarantees the locked one is the field it got wrong. What is *not*
 * here is the copy of the mail the save took — that is a record of what a shop
 * actually said, and no box anywhere edits it.
 *
 * Every field is a string because every field is a box, including the expiry:
 * a promo expires on a date, so the box is a date and the empty string is "the
 * mail states none".
 */
export interface PromoDraft {
  code: string;
  discount: string;
  terms: string;
  /** A calendar day, `YYYY-MM-DD`, or empty for no stated end. */
  expiresAt: string;
  merchant: string;
}

/**
 * The stored instant as the day it is the end of.
 *
 * Pinned to UTC for the reason `promoExpiryLabel` is: `2026-12-24T23:59:59.999Z`
 * read in a local zone is Christmas Day east of Greenwich, and the box would
 * offer a day the mail never named — which one press of Save would then store.
 */
const dayOf = (expiresAt: string | null): string =>
  expiresAt === null ? "" : new Date(expiresAt).toISOString().slice(0, 10);

/** What a row starts editing from: exactly what it was showing. */
export const promoDraft = (promo: SavedPromo): PromoDraft => ({
  code: promo.code ?? "",
  discount: promo.discount,
  terms: promo.terms ?? "",
  expiresAt: dayOf(promo.expiresAt),
  merchant: promo.merchant ?? "",
});

/** An emptied box is a value — "the mail states none" — and not an omission. */
const cleared = (typed: string): string | null => (typed.trim() === "" ? null : typed.trim());

/**
 * What changed, as the request names it — or null when nothing did.
 *
 * A **patch**, not a replacement, and the difference is not tidiness: sending
 * the untouched fields back would make a save from a row loaded five minutes
 * ago overwrite whatever had been corrected since, and would make fixing the
 * merchant require re-typing the terms. So a field this does not name is the
 * field nobody touched.
 *
 * Null for "nothing was touched" so a Save that changed nothing costs no
 * request — the same answer the server would have given, without asking.
 */
export function promoPatch(promo: SavedPromo, draft: PromoDraft): PromoFieldsPatch | null {
  const patch: PromoFieldsPatch = {};

  const code = cleared(draft.code);
  if (code !== promo.code) patch.code = code;

  const discount = draft.discount.trim();
  if (discount !== promo.discount) patch.discount = discount;

  const terms = cleared(draft.terms);
  if (terms !== promo.terms) patch.terms = terms;

  const merchant = cleared(draft.merchant);
  if (merchant !== promo.merchant) patch.merchant = merchant;

  // Compared as days, never as instants: the box holds the day and the column
  // holds the last moment of it, so a re-picked deadline that is the same day is
  // no edit at all.
  const expiresAt = cleared(draft.expiresAt);
  if (expiresAt !== dayOf(promo.expiresAt) || (expiresAt === null) !== (promo.expiresAt === null)) {
    patch.expiresAt = expiresAt;
  }

  return Object.keys(patch).length === 0 ? null : patch;
}

/**
 * Whether the draft may be saved at all.
 *
 * One rule, and it is the wire schema's too: the discount is the headline that
 * makes a row a promo at all, so it is the one field of the five that cannot be
 * emptied. The other four may all be blank together — an offer with no code, no
 * terms, no stated end and a shop the mail never named is still an offer.
 */
export const promoDraftIsSavable = (draft: PromoDraft): boolean => draft.discount.trim() !== "";
