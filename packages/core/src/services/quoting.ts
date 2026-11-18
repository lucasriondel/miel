/**
 * The quoted original under a reply, and the forwarded message under a forward.
 *
 * Pure, and the server's rather than the browser's, so the CLI and the web send
 * the same thing and the original never has to round-trip through a client to
 * be quoted. The design states the rule — the message being answered "is sent
 * either way"; the compose window only collapses it — so a reply carries its
 * quote unless the caller opts out, and may hand back a trimmed copy of the
 * quote's text instead of the stored one.
 *
 * Two renderings travel together: the plain-text quote (`> ` lines under an
 * "On …, … wrote:" attribution) and an HTML one (`blockquote.gmail_quote`, the
 * class every mail client folds), so the original's own HTML survives into the
 * recipient's client instead of being flattened to text.
 */
import { htmlToVisibleText } from "../util/htmlText";

/** What a quote or a forward block is built from — a stored message's columns. */
export interface QuotedOriginal {
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails?: string[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  snippet?: string | null;
  internalDate: Date;
}

/** Both renderings of the same block. */
export interface QuoteBlock {
  /** The line above the quote ("On Thu 30 Oct 2025 at 18:02, Claire … wrote:"). */
  attribution: string;
  text: string;
  html: string;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain text as HTML: escaped, line breaks kept. */
export const textToHtml = (text: string): string => escapeHtml(text).replace(/\r?\n/g, "<br>\n");

const person = (email: string, name: string | null): string =>
  name ? `${name} <${email}>` : email;

/**
 * The date as the attribution writes it, in UTC so the server's own zone never
 * leaks into a mail: "Thu 30 Oct 2025 at 18:02".
 */
export const quoteDate = (d: Date): string => {
  const day = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${day.replace(",", "")} at ${time}`;
};

/** The original's text: the stored plain part, or its HTML made visible text. */
const originalText = (m: QuotedOriginal): string =>
  (m.bodyText && m.bodyText.trim().length > 0
    ? m.bodyText
    : m.bodyHtml
      ? htmlToVisibleText(m.bodyHtml)
      : (m.snippet ?? "")
  ).trimEnd();

/** The original's HTML: the stored HTML part, or its text escaped. */
const originalHtml = (m: QuotedOriginal): string =>
  m.bodyHtml && m.bodyHtml.trim().length > 0 ? m.bodyHtml : textToHtml(originalText(m));

/**
 * The quote under a reply. `trimmedText`, when given, replaces the stored
 * original's text — the compose window lets the user trim the quote — and the
 * HTML is then derived from that text rather than from the untrimmed original.
 */
export function replyQuote(m: QuotedOriginal, trimmedText?: string): QuoteBlock {
  const attribution = `On ${quoteDate(m.internalDate)}, ${person(m.fromEmail, m.fromName)} wrote:`;
  const quotedText = trimmedText ?? originalText(m);
  const text = [
    attribution,
    ...quotedText.split(/\r?\n/).map((line) => (line.length > 0 ? `> ${line}` : ">")),
  ].join("\n");
  const inner = trimmedText !== undefined ? textToHtml(trimmedText) : originalHtml(m);
  const html = [
    `<div class="gmail_quote"><div class="gmail_attr">${escapeHtml(attribution)}<br></div>`,
    `<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">`,
    inner,
    "</blockquote></div>",
  ].join("\n");
  return { attribution, text, html };
}

/** The header block every client writes above a forwarded message. */
export function forwardBlock(m: QuotedOriginal): QuoteBlock {
  const attribution = "---------- Forwarded message ---------";
  const header = [
    `From: ${person(m.fromEmail, m.fromName)}`,
    `Date: ${quoteDate(m.internalDate)}`,
    `Subject: ${m.subject?.trim() || "(no subject)"}`,
    `To: ${m.toEmails.join(", ")}`,
    ...(m.ccEmails && m.ccEmails.length > 0 ? [`Cc: ${m.ccEmails.join(", ")}`] : []),
  ];
  const text = [attribution, ...header, "", originalText(m)].join("\n");
  const html = [
    `<div class="gmail_quote"><div class="gmail_attr">${escapeHtml(attribution)}<br>`,
    header.map((line) => escapeHtml(line)).join("<br>\n"),
    "<br></div><br>",
    originalHtml(m),
    "</div>",
  ].join("\n");
  return { attribution, text, html };
}

/**
 * The bodies a send carries once a block goes under what the user typed: the
 * text with the block's text below a blank line, and the HTML with the typed
 * text escaped above the block's HTML.
 */
export function withBlock(typed: string, block: QuoteBlock): { text: string; html: string } {
  const head = typed.trimEnd();
  return {
    text: `${head}\n\n${block.text}`,
    html: `<div dir="ltr">${textToHtml(head)}</div>\n<br>\n${block.html}`,
  };
}
