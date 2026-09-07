import {
  CODE_NOUNS,
  CONFIRM_KEYWORDS,
  CONNECTORS,
  DETERMINERS,
  LINK_MARKERS,
  NEGATIVE_CONTEXT,
  foldAccents,
} from "./confirmationKeywords";

export interface ConfirmationCode {
  type: "code" | "link" | "otp";
  value: string;
  label?: string;
}

export interface ConfirmationDetection {
  found: boolean;
  codes: ConfirmationCode[];
  description?: string;
}

/**
 * Verification-code extraction, EN/FR/DE/ES/IT.
 *
 * The rule that keeps this honest: a number is only a code if a code noun
 * ("code", "Bestätigungscode", "codice di verifica"…) sits immediately to its
 * left or right. A bare `\b\d{6}\b` anywhere in a keyword-bearing mail is not
 * enough — that pulls order numbers, invoice totals and years out of every
 * shipping notification. Vocabulary lives in `confirmationKeywords.ts`.
 *
 * Matching runs over an accent-folded, lowercased copy of the text while the
 * returned values are sliced out of the original, so `Vérifiez` matches but a
 * code is never mangled.
 */

const MAX_CODES = 4;

/** 4–8 digits, or 6–10 chars of upper-case alphanumeric (e.g. `A1B2C3`). */
const CODE_TOKEN = "([0-9]{4,8}|[A-Z0-9]{6,10})";

const alt = (words: readonly string[]) =>
  words
    // Longest first so "code de verification" wins over bare "code".
    .toSorted((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|");

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * One optional non-noun word between the determiner and the noun, so a brand
 * or qualifier doesn't break the anchor: "your **GitHub** verification code",
 * "votre **nouveau** code", "tu **nueva** clave de acceso".
 */
const BRAND_WORD = String.raw`(?:\b[a-z0-9][\w-]{1,14}\s+){0,2}`;

/**
 * `[determiner] <code noun> [connector] [:/-] <digits>`
 *  — "Your verification code is 482913", "Votre code de confirmation : 482913",
 *    "Ihr Sicherheitscode lautet 482913", "El codigo de acceso es 482913".
 */
const nounFirst = new RegExp(
  String.raw`(?:\b(?:${alt(DETERMINERS)})\s+)?` +
    BRAND_WORD +
    String.raw`\b\w*?(?:${alt(CODE_NOUNS)})\b` +
    String.raw`(?:\s+(?:${alt(CONNECTORS)}))?` +
    String.raw`\s*[:：\-–—]?\s*` +
    CODE_TOKEN,
  "gi",
);

/**
 * `<digits> [is] [determiner] <code noun>`
 *  — "482913 is your verification code", "482913 ist Ihr Bestätigungscode",
 *    "482913 es tu codigo de acceso".
 */
const codeFirst = new RegExp(
  CODE_TOKEN +
    String.raw`\s+(?:(?:${alt(CONNECTORS)})\s+)?` +
    String.raw`(?:(?:${alt(DETERMINERS)})\s+)?` +
    BRAND_WORD +
    String.raw`\b\w*?(?:${alt(CODE_NOUNS)})\b`,
  "gi",
);

const confirmKeyword = new RegExp(
  String.raw`\b(?:${alt([...CONFIRM_KEYWORDS, ...CODE_NOUNS])})\b`,
  "i",
);

const linkPattern = new RegExp(
  String.raw`https?://[^\s<>'"]*(?:${alt(LINK_MARKERS)})[^\s<>'"]*`,
  "gi",
);

const negativeContext = new RegExp(String.raw`\b(?:${alt(NEGATIVE_CONTEXT)})\b`, "i");

/** Chars of surrounding text checked for order/invoice/etc. wording. */
const NEGATIVE_WINDOW = 40;

export function detectConfirmationCodes(
  subject: string | null | undefined,
  bodyText: string | null | undefined,
  bodyHtml: string | null | undefined,
): ConfirmationDetection {
  const raw = [subject || "", bodyText || "", stripHtmlTags(bodyHtml || "")]
    .filter(Boolean)
    .join("\n");

  if (!raw.trim()) return { found: false, codes: [] };

  // Folded copy for matching; indices stay aligned with `raw` because
  // foldAccents only removes combining marks and expands ß → ss. The ß case
  // shifts later indices by one per occurrence, which is harmless here: we
  // slice code values out of the folded text, and codes are ASCII digits.
  const haystack = foldAccents(raw);

  if (!confirmKeyword.test(haystack)) return { found: false, codes: [] };

  const codes: ConfirmationCode[] = [];
  const seen = new Set<string>();

  const push = (code: ConfirmationCode) => {
    const key = code.value.toLowerCase();
    if (seen.has(key) || codes.length >= MAX_CODES) return;
    seen.add(key);
    codes.push(code);
  };

  for (const pattern of [nounFirst, codeFirst]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(haystack)) !== null) {
      const value = match[1];
      if (!value || isImplausibleCode(value)) continue;
      if (hasNegativeContext(haystack, match.index, match[0].length)) continue;
      push({ type: "otp", value, label: `Code: ${value}` });
    }
  }

  linkPattern.lastIndex = 0;
  let link: RegExpExecArray | null;
  while ((link = linkPattern.exec(haystack)) !== null) {
    // Slice from `raw` so the opened URL is the original, unfolded one.
    const value = raw.slice(link.index, link.index + link[0].length);
    push({ type: "link", value, label: "Verification link" });
  }

  return {
    found: codes.length > 0,
    codes,
    description: describe(codes),
  };
}

function describe(codes: ConfirmationCode[]): string | undefined {
  if (codes.length === 0) return undefined;
  if (codes.length === 1) {
    return codes[0].type === "link" ? "Found verification link" : "Found confirmation code";
  }
  return `Found ${codes.length} verification items`;
}

/**
 * Reject values that match the shape but can't be a code in practice: a
 * four-digit year, an all-same-digit run, or a pure-alpha token that slipped
 * through the alphanumeric branch.
 */
function isImplausibleCode(value: string): boolean {
  if (/^(\d)\1+$/.test(value)) return true;
  if (/^(?:19|20)\d{2}$/.test(value)) return true;
  if (/^[A-Za-z]+$/.test(value)) return true;
  return false;
}

function hasNegativeContext(text: string, index: number, length: number): boolean {
  const start = Math.max(0, index - NEGATIVE_WINDOW);
  const end = Math.min(text.length, index + length + NEGATIVE_WINDOW);
  return negativeContext.test(text.slice(start, end));
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
