/**
 * A message body as visible text — markup gone, style and script contents
 * dropped, entities decoded, whitespace collapsed (#156).
 *
 * What the promo-extract task is handed instead of raw HTML. A marketing mail
 * is mostly table scaffolding, inlined CSS and tracking parameters: the model
 * pays to read all of it, and a `<style>` block reads as prose to something
 * that is only ever handed a string. Stripping is also what makes the truncation
 * mean something — 8000 characters of `<td style="…">` is a few sentences of
 * actual offer.
 *
 * Deliberately a regex pass and not a parser. The input is one email body being
 * summarised by a model, not a document being rendered: a malformed tag costs a
 * word, and there is no DOM in core to borrow.
 */

/** Elements whose *contents* are not visible text, dropped whole. */
const INVISIBLE_ELEMENTS = /<(script|style|head|title|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Comments and doctypes/processing instructions, which carry no text either. */
const COMMENTS = /<!--[\s\S]*?-->/g;

/** Any remaining tag, including an unclosed one at the end of a truncated body. */
const TAGS = /<[^>]*>?/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  pound: "£",
  euro: "€",
  yen: "¥",
  cent: "¢",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  deg: "°",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  szlig: "ß",
  ntilde: "ñ",
};

/**
 * One pass over the entity syntax rather than a chain of `.replace`s: chaining
 * decodes `&amp;nbsp;` twice, turning text the sender escaped on purpose into a
 * space. An entity this table does not know is left as written — it is a word
 * the model can still read, where a blank would be a word it cannot.
 */
function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code =
        body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

export function htmlToVisibleText(html: string): string {
  return decodeEntities(
    html
      .replace(INVISIBLE_ELEMENTS, " ")
      .replace(COMMENTS, " ")
      // A space rather than nothing: `<td>SAVE20</td><td>ends Sunday</td>` is two
      // cells a reader sees apart, and "SAVE20ends" is a code that does not exist.
      .replace(TAGS, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}
