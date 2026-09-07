/**
 * One accent folding, shared by everything in miel that matches a multilingual
 * word list.
 *
 * A leaf module for the same reason as `claudeUsage.ts`: it touches neither the
 * database nor the environment, so anything may import it. It lives here rather
 * than beside its first caller because it now has two — the web app's
 * verification-code vocabulary (`utils/confirmationKeywords.ts`, which
 * re-exports it, so its own callers are unchanged) and core's promo prefilter
 * (`services/promoPrefilter.ts`, #155). A second copy would mean two answers to
 * "does `Ermäßigung` match `ermassigung`", and the word lists on both sides are
 * written unaccented on the assumption that there is one.
 */

/** Strip diacritics and normalise ß so a word list can stay ASCII. */
export function foldAccents(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");
}
