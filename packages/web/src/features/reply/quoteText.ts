/**
 * The quote under a reply, as the window lets someone trim it.
 *
 * The server answers the quote as it will send it — the attribution line, then
 * the original's text with `> ` in front of every line — and takes a trimmed
 * copy back as the original's text alone (`quotedText`), which it prefixes
 * again itself. These two functions are that round trip, and nothing else
 * about the quote is the browser's.
 */

/** The original's text out of the server's quote: no attribution, no `>` markers. */
export const unquote = (quote: { attribution: string; text: string }): string => {
  const lines = quote.text.split(/\r?\n/);
  const body = lines[0] === quote.attribution ? lines.slice(1) : lines;
  return body.map((line) => line.replace(/^> ?/, "")).join("\n");
};

/**
 * What a reply sends about its quote, from what the window holds: nothing when
 * the quote was left alone (the server quotes the stored original), the
 * trimmed text when it was edited, and no quote at all when it was emptied —
 * an empty quote is a quote someone removed.
 */
export const quoteFields = (
  quotedText: string | null,
): { includeQuote?: false; quotedText?: string } => {
  if (quotedText === null) return {};
  if (quotedText.trim().length === 0) return { includeQuote: false };
  return { quotedText };
};
