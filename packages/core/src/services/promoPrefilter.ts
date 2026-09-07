/**
 * Which fetched mail is worth spending a model call on (#155).
 *
 * Pure: text in, a boolean out. No store, no model, no I/O — and no sender.
 * The input carries a subject and a body and nothing else, so "content signals
 * only" is the shape of the function rather than a promise in a comment: there
 * is no retailer allowlist and no sender directory to drift, because a
 * vocabulary of shop names is the problem the confirmation keywords already
 * have and it never covers the shop you actually buy from.
 *
 * Deliberately cheap, dumb and generous. A false positive costs one model call;
 * a false negative costs the feature, since nothing ever asks twice.
 */
import { foldAccents } from "../accentFolding";

/** The message content the decision is made from. Note what is absent. */
export interface PromoPrefilterInput {
  subject?: string | null;
  /** The mail's visible text — HTML stripped before it gets here. */
  text?: string | null;
}

/**
 * A figure next to a percent sign, either way round: `30%`, `30 %`, `%30`.
 * Language-neutral, and the single strongest thing a discount mail carries.
 */
const PERCENTAGE = /\d\s?%|%\s?\d/;

/**
 * A price: a currency symbol with a figure against it. The symbol alone is not
 * a signal — a receipt is full of them — so it counts only beside a figure, and
 * only near an {@link OFFER_WORDS} hit.
 */
const PRICE = /[$€£¥₹₽₺]\s?\d|\d\s?[$€£¥₹₽₺]/g;

/**
 * A code-shaped run: four to twenty-four upper-case characters carrying at
 * least one letter and at least one digit — `SPRING24`, `WELCOME15`, `BF2026`.
 *
 * The mixed requirement is what keeps ordinary mail out. A pure-letter run is
 * an acronym (`PDF`, `ASAP`, `NDA`) or a shouted word, and a pure-digit one is
 * a year or an amount; neither is a discount code, and admitting them would
 * accept most of the inbox.
 */
const CODE_RUN = /\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{4,24}\b/;

/**
 * Words that say a price has been cut or a code exists. Written folded and
 * lowercase — `foldAccents` runs over the text first, so `réduction`,
 * `Ermäßigung` and `código promocional` all reach the entries below — and kept
 * to terms that are hard to write by accident, because one of these is enough
 * on its own.
 *
 * EN, FR, DE, ES, IT, the same five the verification-code vocabulary covers.
 */
const DISCOUNT_WORDS = [
  // en
  "sale",
  "sales",
  "discount",
  "discounts",
  "discounted",
  "coupon",
  "coupons",
  "voucher",
  "vouchers",
  "promo",
  "promo code",
  "promotion",
  "promotional",
  "clearance",
  "free shipping",
  "half price",
  "black friday",
  "cyber monday",
  // fr
  "solde",
  "soldes",
  "remise",
  "remises",
  "reduction",
  "reductions",
  "code promo",
  "destockage",
  "livraison offerte",
  "vente privee",
  "vente flash",
  // de
  "rabatt",
  "rabatte",
  "rabattcode",
  "gutschein",
  "gutscheine",
  "gutscheincode",
  "aktionscode",
  "ermassigung",
  "ermassigt",
  "ausverkauf",
  "schnappchen",
  "kostenloser versand",
  // es
  "descuento",
  "descuentos",
  "rebajas",
  "cupon",
  "cupones",
  "codigo promocional",
  "promocion",
  "liquidacion",
  "envio gratis",
  // it
  "sconto",
  "sconti",
  "scontato",
  "codice sconto",
  "saldi",
  "buono sconto",
  "svendita",
  "promozione",
  "spedizione gratuita",
] as const;

/**
 * Words that mean a promotion only when a price is sitting beside them. Every
 * one of them is ordinary prose on its own — a job offer, a day off, money
 * saved — so they never decide alone; {@link PRICE} near one is the signal.
 */
const OFFER_WORDS = [
  // en
  "off",
  "offer",
  "offers",
  "deal",
  "deals",
  "save",
  "savings",
  "free",
  "only",
  // fr
  "offre",
  "offres",
  "gratuit",
  "gratuite",
  "economisez",
  "seulement",
  // de
  "angebot",
  "angebote",
  "aktion",
  "sparen",
  "gratis",
  "kostenlos",
  "nur",
  // es
  "oferta",
  "ofertas",
  "ahorra",
  "ahorre",
  "gratis",
  "solo",
  // it
  "offerta",
  "offerte",
  "risparmia",
  "gratis",
  "gratuito",
  "solo",
] as const;

/** Characters between a price and an offer word that still count as "beside". */
const PRICE_WINDOW = 60;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const wordSet = (words: readonly string[]) =>
  new RegExp(String.raw`\b(?:${words.map(escapeRegex).join("|")})\b`);

const discountWord = wordSet(DISCOUNT_WORDS);
const offerWord = wordSet(OFFER_WORDS);

/**
 * Is this mail worth an extraction call?
 *
 * The signals, in order of weight: a percentage, a price beside an offer word,
 * a code-shaped run, and only then the discount vocabulary — the language-
 * neutral ones first, so a mail written in none of the five languages the word
 * lists cover is still caught by its own numbers.
 */
export function shouldExtractPromos(input: PromoPrefilterInput): boolean {
  const raw = [input.subject ?? "", input.text ?? ""].join("\n");
  if (raw.trim().length === 0) return false;

  // One folded copy that every rule reads. Case survives it, because case is
  // half of what makes a code a code; and folding leaves digits, percent signs
  // and currency symbols alone, so the numeric rules lose nothing by running
  // over it — while every offset below stays in the same string.
  const folded = foldAccents(raw);

  if (PERCENTAGE.test(folded)) return true;
  if (hasPriceNearOfferWord(folded)) return true;
  if (CODE_RUN.test(folded)) return true;
  return discountWord.test(folded.toLowerCase());
}

/**
 * A price and an offer word within {@link PRICE_WINDOW} of each other — scanned
 * price by price rather than as one regex, so either can come first and neither
 * has to be the thing the window is centred on.
 */
function hasPriceNearOfferWord(folded: string): boolean {
  PRICE.lastIndex = 0;
  let price: RegExpExecArray | null;
  while ((price = PRICE.exec(folded)) !== null) {
    const start = Math.max(0, price.index - PRICE_WINDOW);
    const end = Math.min(folded.length, price.index + price[0].length + PRICE_WINDOW);
    if (offerWord.test(folded.slice(start, end).toLowerCase())) return true;
  }
  return false;
}
