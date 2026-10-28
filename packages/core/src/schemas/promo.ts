import { Schema } from "effect";
import { z } from "zod";

/**
 * What the promo-extract task is given: one marketing mail, on its own (#156).
 *
 * One message per call rather than a batch. A batch of stripped marketing mails
 * invites the model to attribute a code from one shop to another — a silent
 * wrong answer landing in a row the user trusts at a checkout.
 *
 * `body` is the mail's stripped visible text (`util/htmlText.ts`), not raw HTML,
 * and `receivedAt` is stated so a relative expiry ("ends Sunday", "48h only")
 * can be resolved into an absolute date. Doing that resolution in code would
 * mean reimplementing date parsing across five languages.
 */
export const PromoExtractInput = z.object({
  /** The sender as displayed — the fallback the prompt names for `merchant`. */
  from: z.string(),
  subject: z.string().nullable(),
  /** When the mail arrived, ISO 8601. The anchor every relative expiry needs. */
  receivedAt: z.string(),
  /** The mail's visible text, truncated by the prompt builder that sends it. */
  body: z.string(),
});
export type PromoExtractInputT = z.infer<typeof PromoExtractInput>;

/**
 * An expiry is a calendar date, so it is stored and read as one. The `u` flag
 * is what lets the Schema export it as a JSON Schema `pattern`, so the model is
 * told the shape as well as asked for it.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

const NonEmpty = Schema.String.check(Schema.isNonEmpty());

/**
 * One offer.
 *
 * Four of the five fields are nullable because a mail routinely states none of
 * them; `discount` is the headline that makes it a promo at all. There is no
 * confidence score: a score invites a threshold nobody can tune, and there is
 * no feedback loop to tune it against.
 */
export const ExtractedPromo = Schema.Struct({
  /**
   * The literal code. Nullable, and deliberately still so after #166: the
   * service drops a code-less entry before it becomes a row, because a promo
   * row is a code someone copies at a checkout. Making this non-nullable would
   * turn "free shipping, applied automatically" into a schema violation, and a
   * schema violation fails the whole mail — losing the coded offers beside it.
   * A code-less entry is a skipped entry, never a failed extraction.
   */
  code: Schema.NullOr(NonEmpty),
  /** The badge headline — `20% off`. */
  discount: NonEmpty,
  /** The qualifying rest — `orders over £50, excl. sale`. */
  terms: Schema.NullOr(NonEmpty),
  /**
   * An absolute date (`YYYY-MM-DD`), or null. Never guessed — and the shape is
   * checked here as well as asked for in the prompt, because "ends Sunday" is
   * not a deadline anyone standing at a checkout can act on.
   */
  expiresAt: Schema.NullOr(Schema.String.check(Schema.isPattern(ISO_DATE))),
  /**
   * The shop's recognisable name. Worth asking for despite the sender being
   * right there: the sender is `newsletter@email.marketing-cloud.example.com`,
   * and a saved promo outlives the mail it came from.
   */
  merchant: Schema.NullOr(NonEmpty),
});
export type ExtractedPromoT = typeof ExtractedPromo.Type;

/**
 * Zero or more promos. A retailer's mail routinely carries three, and
 * first-code-wins would silently drop data the model already found; an empty
 * array is the negative answer.
 */
export const PromoExtractOutput = Schema.Struct({
  promos: Schema.mutable(Schema.Array(ExtractedPromo)),
});
export type PromoExtractOutputT = typeof PromoExtractOutput.Type;
