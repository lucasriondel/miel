/**
 * Turns a prerendered TanStack Start page into a fully self-contained document:
 * no scripts at all, and no subresource the browser has to fetch.
 *
 * Two reasons this exists rather than trusting the framework output. The page
 * must read completely with JavaScript disabled, and it must not reference any
 * asset that could end up on the wrong side of the Cloudflare Access boundary
 * once it is served from the app's nginx root.
 */

/** Resolves a href emitted by the build to its file contents, or null if absent. */
export type AssetReader = (url: string) => string | null;

const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>|<script\b[^>]*\/>/gi;
const LINK_RE = /<link\b[^>]*>/gi;
const IMG_RE = /<img\b[^>]*>/gi;
const STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
const STYLE_ATTR_RE = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** `url(...)` in any form, plus the string form of `@import`. */
const CSS_REF_RE =
  /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi;

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  if (!match) return undefined;
  return match[2] ?? match[3] ?? match[4];
}

/** rel values whose only purpose is to make the browser fetch something. */
function isFetchingRel(rel: string | undefined): boolean {
  if (!rel) return false;
  return /\b(stylesheet|modulepreload|preload|prefetch|preconnect|dns-prefetch|icon|apple-touch-icon|manifest)\b/i.test(
    rel,
  );
}

export function staticizeHtml(html: string, readAsset: AssetReader = () => null): string {
  const withoutScripts = html.replace(SCRIPT_RE, "");

  return withoutScripts.replace(LINK_RE, (tag) => {
    const rel = attr(tag, "rel");
    if (!isFetchingRel(rel)) return tag;

    if (/\bstylesheet\b/i.test(rel ?? "")) {
      const href = attr(tag, "href");
      const css = href ? readAsset(href) : null;
      if (css === null) {
        throw new Error(
          `staticize: cannot inline stylesheet ${href ?? "(no href)"} — asset not found in the build output`,
        );
      }
      return `<style>${css}</style>`;
    }

    return "";
  });
}

/**
 * Fonts, images and stylesheets a block of CSS would make the browser fetch.
 * `data:` URIs are inline by definition, so they are not references.
 */
function cssReferences(css: string): string[] {
  const refs: string[] = [];

  for (const match of css.matchAll(CSS_REF_RE)) {
    const url = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? "").trim();
    if (url.length > 0 && !/^data:/i.test(url)) refs.push(url);
  }

  return refs;
}

/**
 * Every reference in the document that would make a browser fetch something, or
 * run JavaScript. An empty result is the property the built page must hold.
 *
 * Inlined CSS counts: a `@font-face` or `background: url(...)` inside a `<style>`
 * element is just as external as a `<link>`, and inlining the stylesheet is what
 * moves it there — so the check has to look inside, or the guard has a hole the
 * build's own staticize step would widen.
 */
export function findExternalReferences(html: string): string[] {
  const refs: string[] = [];

  for (const tag of html.match(SCRIPT_RE) ?? []) {
    refs.push(attr(tag, "src") ?? "<inline script>");
  }
  for (const tag of html.match(LINK_RE) ?? []) {
    if (isFetchingRel(attr(tag, "rel"))) refs.push(attr(tag, "href") ?? "<link with no href>");
  }
  for (const tag of html.match(IMG_RE) ?? []) {
    refs.push(attr(tag, "src") ?? "<img with no src>");
  }
  for (const match of html.matchAll(STYLE_BLOCK_RE)) {
    refs.push(...cssReferences(match[1] ?? ""));
  }
  for (const match of html.matchAll(STYLE_ATTR_RE)) {
    refs.push(...cssReferences(match[1] ?? match[2] ?? ""));
  }

  return refs;
}
