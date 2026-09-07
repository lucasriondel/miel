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

/** An expiry is a calendar date, so it is stored and read as one. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One offer.
 *
 * Four of the five fields are nullable because a mail routinely states none of
 * them; `discount` is the headline that makes it a promo at all. There is no
 * confidence score: a score invites a threshold nobody can tune, and there is
 * no feedback loop to tune it against.
 */
export const ExtractedPromo = z.object({
  /** The literal code, or null for "no code needed, applied at checkout". */
  code: z.string().min(1).nullable(),
  /** The badge headline — `20% off`. */
  discount: z.string().min(1),
  /** The qualifying rest — `orders over £50, excl. sale`. */
  terms: z.string().min(1).nullable(),
  /**
   * An absolute date (`YYYY-MM-DD`), or null. Never guessed — and the shape is
   * checked here as well as asked for in the prompt, because "ends Sunday" is
   * not a deadline anyone standing at a checkout can act on.
   */
  expiresAt: z.string().regex(ISO_DATE).nullable(),
  /**
   * The shop's recognisable name. Worth asking for despite the sender being
   * right there: the sender is `newsletter@email.marketing-cloud.example.com`,
   * and a saved promo outlives the mail it came from.
   */
  merchant: z.string().min(1).nullable(),
});
export type ExtractedPromoT = z.infer<typeof ExtractedPromo>;

/**
 * Zero or more promos. A retailer's mail routinely carries three, and
 * first-code-wins would silently drop data the model already found; an empty
 * array is the negative answer.
 */
export const PromoExtractOutput = z.object({
  promos: z.array(ExtractedPromo),
});
export type PromoExtractOutputT = z.infer<typeof PromoExtractOutput>;
