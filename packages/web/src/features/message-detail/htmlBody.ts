const BASE_STYLES = `
  html, body { margin: 0; padding: 0; background: #fff; color: #1a1a1a; }
  body {
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  img, video { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  pre, code { white-space: pre-wrap; word-break: break-word; }
  a { color: #2563eb; }
  blockquote {
    margin: 0 0 0 8px;
    padding-left: 12px;
    border-left: 3px solid #d1d5db;
    color: #4b5563;
  }
`;

/**
 * Wraps the message HTML in a minimal document with Gmail-ish styling so the
 * iframe doesn't render against a transparent body with no font. Sets
 * `<base target="_blank">` so anchor clicks open in a new tab instead of
 * navigating the iframe (which `sandbox="allow-same-origin"` would block
 * anyway, leaving the link looking dead).
 */
export function wrapMessageHtml(bodyHtml: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>${BASE_STYLES}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

/**
 * Replaces remote `src` on `<img>` tags with `data-blocked-src` so images
 * don't load until the user explicitly opts in (matches Gmail's "Display
 * images below" default for unknown senders). Data and cid URIs pass through
 * since they're either inline or unreachable anyway.
 */
export function stripRemoteImages(html: string): string {
  return html.replace(
    /<img\b([^>]*?)\ssrc=(['"])([^'"]+)\2([^>]*)>/gi,
    (match, before, quote, src, after) => {
      if (/^(data:|cid:)/i.test(src)) return match;
      return `<img${before} data-blocked-src=${quote}${src}${quote}${after} alt="" style="display:none">`;
    },
  );
}
