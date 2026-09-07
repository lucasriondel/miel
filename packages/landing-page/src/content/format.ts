/**
 * Shared formatting for the figures and lists quoted in the copy.
 *
 * One helper rather than one per page: the homepage's disclosure and the
 * privacy policy quote the same constants from `@miel/core/claudeUsage`, and
 * they must read identically wherever they appear.
 */
import { BODY_BEARING_TASKS } from "@miel/core/claudeUsage";

/** Thousands-separated, so a figure reads as prose rather than as a literal. */
export function count(n: number): string {
  return n.toLocaleString("en-US");
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six"];

/**
 * A small tally as a word — "two kinds of request", not "2 kinds of request".
 *
 * It exists so a sentence can count a list rather than assert a number a later
 * change makes wrong: the body-bearing tasks (#158) were one and are now two,
 * and the copy that said "the one request" is exactly what this issue fixed.
 * Beyond the words it knows, the digits are better than nothing.
 */
export function amount(n: number): string {
  return WORDS[n] ?? count(n);
}

/** Sentence case for a label written to sit mid-sentence. */
function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * One sentence per task that sends a whole message body, in core's own words
 * (#158) — the shared half of a paragraph each page frames for itself.
 *
 * Composed rather than written out because reply drafting was the only such
 * task until promo extraction landed, and both pages had said so in prose. A
 * third one gains its sentence on both pages by gaining a row in
 * `@miel/core/claudeUsage`.
 */
export function bodyBearingSentences(): string {
  return BODY_BEARING_TASKS.map((task) => `${sentenceCase(task.label)} sends ${task.sends}.`).join(
    " ",
  );
}
