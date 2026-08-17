/**
 * Shared formatting for figures quoted in the copy.
 *
 * One helper rather than one per page: the homepage's disclosure and the
 * privacy policy quote the same constants from `@miel/core/claudeUsage`, and
 * they must read identically wherever they appear.
 */

/** Thousands-separated, so a figure reads as prose rather than as a literal. */
export function count(n: number): string {
  return n.toLocaleString("en-US");
}
