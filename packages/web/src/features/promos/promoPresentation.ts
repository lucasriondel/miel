import type { PromoListing } from "../../api/types";

/**
 * How the Promo Codes page names and marks a promo — pure, so what a row says
 * is assertable without a DOM.
 */

/** Who the promo is from: the extracted merchant, else the sender's name. */
export const promoMerchant = (promo: Pick<PromoListing, "merchant" | "fromName">): string | null =>
  promo.merchant ?? promo.fromName ?? null;

/** Words that do not name the shop, so they do not earn a letter. */
const FILLER = new Set(["le", "la", "les", "the", "de", "du", "des", "of", "and", "&"]);

/**
 * The monogram's letters: the first letter of up to two words — "Calvin Klein"
 * is CK, "Aroma-Zone" AZ, "Le Slip Français" SF — and one letter for one word.
 */
export const monogramInitials = (name: string | null): string => {
  if (!name) return "?";
  const words = name
    .split(/[\s\-_.]+/)
    .filter((word) => word.length > 0 && !FILLER.has(word.toLowerCase()));
  const picked = words.length > 0 ? words : [name];
  return picked
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("")
    .toUpperCase();
};

/**
 * The monogram tints, as the design draws them: a pale fill and the same hue
 * deepened for the letters. These are identity colours derived from the
 * merchant's name — data, like a Gmail label's swatch — not chrome, which is
 * why they are literals rather than theme tokens. Index 0 onward is stable: a
 * shop keeps its colour across renders and reloads.
 */
export const MONOGRAM_TONES = [
  { bg: "#fce8ec", fg: "#8a2b42" },
  { bg: "#e7f0e4", fg: "#2f5a2a" },
  { bg: "#e5edf8", fg: "#24497a" },
  { bg: "#e3f2ee", fg: "#1e5b4c" },
  { bg: "#f3eef9", fg: "#5b3a87" },
  { bg: "#e9eef7", fg: "#23407a" },
  { bg: "#fcefe3", fg: "#8a4614" },
] as const;

export type MonogramTone = (typeof MONOGRAM_TONES)[number];

export const monogramTone = (name: string | null): MonogramTone => {
  const key = (name ?? "").toLowerCase();
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return MONOGRAM_TONES[hash % MONOGRAM_TONES.length]!;
};

/** Second-level labels a country registry puts a name under (`shop.co.uk`). */
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "ne", "or"]);

/**
 * The shop's site, read off the sender's address: `news@e.calvinklein.fr` is
 * `calvinklein.fr`. Mailing subdomains go, the registrable name stays. Null when
 * there is no address to read.
 */
export const shopDomain = (fromEmail: string | null): string | null => {
  const host = fromEmail?.split("@")[1]?.trim().toLowerCase();
  if (!host || !host.includes(".")) return null;
  const labels = host.split(".");
  const keep =
    labels.length >= 3 && labels.at(-1)!.length === 2 && SECOND_LEVEL.has(labels.at(-2)!) ? 3 : 2;
  return labels.slice(-keep).join(".");
};
