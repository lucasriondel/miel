/**
 * Post-build verification: each prerendered page carries its whole text as raw
 * HTML, readable with JavaScript disabled.
 *
 * This is the property that motivated prerendering in the first place. A
 * regression to client-only rendering — a hydration script and an empty mount
 * element — should fail the build, not be discovered by a reader with scripts
 * off or by a crawler that indexes an empty page.
 *
 * Two things make the check worth more than `grep`:
 *
 * - It asserts against the *rendered text*, not the bytes. Copy that survives
 *   only inside a `<script>` payload is exactly what a client-rendered shell
 *   looks like, and it must not count as present.
 * - The contracts are derived from the same content modules the pages render
 *   from — `SCOPE_DISCLOSURES` above all, itself derived from core's canonical
 *   `GOOGLE_SCOPES`. Adding a scope extends this check by itself; there is no
 *   second list to remember.
 *
 * It reads the built files, so it belongs to `bun run build` (see
 * `scripts/verify-prerendered.ts`) rather than to the plain unit suite, which
 * must stay runnable without a build. `verifyPrerendered.test.ts` covers the
 * logic here on synthetic HTML.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { findExternalReferences } from "./staticize";
import { GUIDE_SECTIONS, allGuideText } from "../content/guide";
import { allLegalText, type LegalPage } from "../content/legal";
import { HOME_PATH, LEGAL_POINTER, otherPages } from "../content/nav";
import { PRIVACY } from "../content/privacy";
import { SCOPE_DISCLOSURES, allScopeText } from "../content/scopes";
import {
  CLAUDE_DISCLOSURE,
  CONTACT_EMAIL,
  GITHUB_URL,
  HOME,
  PERMISSIONS,
  SITE_NAME,
  allHomeText,
} from "../content/site";
import { TERMS } from "../content/terms";

/** An element whose number on the page is fixed, and what to call it in a failure. */
export type ElementCount = { what: string; pattern: RegExp; expected: number };

export type PageContract = {
  /** The route the page is prerendered at. */
  route: string;
  /** How the page is named in this check's output. */
  label: string;
  /** Copy that must be present as text a browser renders, not merely in the bytes. */
  text: readonly string[];
  /** Raw-markup fragments the page's structure owes a screen-reader user. */
  markup: readonly string[];
  /** Hrefs the page must link to. */
  links: readonly string[];
  /** Hrefs the page must not carry — a page never links to itself. */
  absentLinks: readonly string[];
  counts: readonly ElementCount[];
};

export type BuiltPage = {
  contract: PageContract;
  /** The file the page was read from, or null when the build emitted none. */
  file: string | null;
  html: string;
};

/** `dist/public` — what staticize emits and what nginx serves. */
export const PUBLIC_DIR = resolve(import.meta.dirname, "../..", "dist", "public");

/** Everything every page owes, whichever route it is. */
const DOCUMENT_MARKUP = [
  'name="viewport" content="width=device-width, initial-scale=1"',
  "<main>",
  "<header",
  "<footer",
  // Inlined, so the page needs no stylesheet fetch, and follows the system scheme.
  "<style>",
  "prefers-color-scheme: dark",
  "color-scheme: light dark",
];

const DOCUMENT_COUNTS: ElementCount[] = [
  { what: "top-level heading", pattern: /<h1[\s>]/g, expected: 1 },
  { what: "document title", pattern: /<title>/g, expected: 1 },
];

/** The pair of attributes that give a section an accessible name. */
function namedSection(id: string): string[] {
  return [`aria-labelledby="${id}-heading"`, `id="${id}-heading"`];
}

const HOME_CONTRACT: PageContract = {
  route: HOME_PATH,
  label: "homepage",
  text: unique([
    SITE_NAME,
    ...allHomeText().split("\n"),
    // Why Miel exists, how to install it, how to contribute — the three
    // sections the side menu navigates between.
    ...allGuideText().split("\n"),
    // Every row of the permission table, derived from the canonical scope list.
    ...allScopeText().split("\n"),
    // The literal scope strings, so a reader can match them against consent.
    ...SCOPE_DISCLOSURES.map((row) => row.scope),
    // The pointer at the legal pages sits under the AI-provider disclosure, where
    // a reader wants the detail, not only in the footer.
    ...Object.values(LEGAL_POINTER),
    ...otherPages(HOME_PATH).map((entry) => entry.label),
  ]),
  markup: [
    ...DOCUMENT_MARKUP,
    `<title>${escapeHtml(HOME.title)}</title>`,
    // A real table, not a grid of divs: caption, header row, row headers.
    `<caption>${escapeHtml(PERMISSIONS.tableCaption)}</caption>`,
    "<thead>",
    "<tbody>",
    ...Object.values(PERMISSIONS.columns).map(
      (heading) => `<th scope="col">${escapeHtml(heading)}</th>`,
    ),
    ...SCOPE_DISCLOSURES.map((row) => `<th scope="row">${escapeHtml(row.permission)}</th>`),
    ...[
      ...HOME.sections.map((section) => section.id),
      ...GUIDE_SECTIONS.map((section) => section.id),
      PERMISSIONS.id,
      CLAUDE_DISCLOSURE.id,
      "contact",
    ].flatMap(namedSection),
    // The side menu links to every guide section, so a reader who arrives at
    // the foot of the page still has a way into each one.
    ...GUIDE_SECTIONS.map((section) => `href="#${section.id}"`),
  ],
  links: [GITHUB_URL, `mailto:${CONTACT_EMAIL}`, PRIVACY.path, TERMS.path],
  absentLinks: [HOME_PATH],
  counts: [
    ...DOCUMENT_COUNTS,
    // The prose sections, the guide sections the side menu navigates, plus
    // permissions, the AI-provider disclosure and contact.
    {
      what: "section",
      pattern: /<section[\s>]/g,
      expected: HOME.sections.length + GUIDE_SECTIONS.length + 3,
    },
    { what: "column header", pattern: /<th scope="col">/g, expected: 3 },
    { what: "row header", pattern: /<th scope="row">/g, expected: SCOPE_DISCLOSURES.length },
  ],
};

function legalContract(page: LegalPage): PageContract {
  return {
    route: page.path,
    label: page.navLabel.toLowerCase(),
    text: unique([
      SITE_NAME,
      ...allLegalText(page).split("\n"),
      ...otherPages(page.path).map((entry) => entry.label),
    ]),
    markup: [
      ...DOCUMENT_MARKUP,
      // Its own title, not the homepage's, so a search result names the page.
      `<title>${escapeHtml(page.title)}</title>`,
      `<h1>${escapeHtml(page.heading)}</h1>`,
      ...[...page.sections.map((section) => section.id), "contact"].flatMap(namedSection),
    ],
    links: [
      GITHUB_URL,
      `mailto:${CONTACT_EMAIL}`,
      ...otherPages(page.path).map((entry) => entry.path),
    ],
    absentLinks: [page.path],
    counts: [
      ...DOCUMENT_COUNTS,
      // Every section on the page, plus the contact section.
      { what: "section", pattern: /<section[\s>]/g, expected: page.sections.length + 1 },
    ],
  };
}

export const PAGE_CONTRACTS: readonly PageContract[] = [
  HOME_CONTRACT,
  legalContract(PRIVACY),
  legalContract(TERMS),
];

export function contractFor(route: string): PageContract {
  const contract = PAGE_CONTRACTS.find((candidate) => candidate.route === route);
  if (!contract) throw new Error(`no page contract for ${route}`);
  return contract;
}

/**
 * A route may be emitted as `privacy/index.html` or `privacy.html` depending on
 * how the prerenderer writes clean URLs; either satisfies the requirement, so
 * the check resolves both rather than pinning a filename it does not care about.
 */
export function pageFileCandidates(route: string): string[] {
  if (route === "/") return ["index.html"];
  const name = route.replace(/^\//, "");
  return [join(name, "index.html"), `${name}.html`];
}

/** Raised when there is nothing to check, so the failure names the fix. */
export class MissingBuildError extends Error {}

export function readBuiltPages(publicDir: string = PUBLIC_DIR): BuiltPage[] {
  const pages = existsSync(publicDir)
    ? PAGE_CONTRACTS.map((contract) => {
        const file =
          pageFileCandidates(contract.route)
            .map((name) => join(publicDir, name))
            .find(existsSync) ?? null;
        return { contract, file, html: file ? readFileSync(file, "utf8") : "" };
      })
    : [];

  if (pages.every((page) => page.file === null)) {
    throw new MissingBuildError(
      `nothing to check in ${publicDir} — run \`bun run build\` in packages/landing-page first; ` +
        `this step verifies the HTML the build emits.`,
    );
  }

  return pages;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) return String.fromCodePoint(Number(body.slice(1)));
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * The text a browser would show: script and style contents dropped, comments
 * dropped (React separates adjacent text nodes with one), tags replaced by a
 * space, entities decoded, whitespace collapsed.
 *
 * A tag boundary becomes a space, so a required string must live inside a
 * single element. The content modules keep each string whole, which is what
 * makes that a fair rule rather than a trap.
 */
export function extractRenderedText(html: string): string {
  return normalize(
    decodeEntities(
      html
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]*>/g, " "),
    ),
  );
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function quote(value: string): string {
  const flat = normalize(value);
  return flat.length > 80 ? `"${flat.slice(0, 79)}…"` : `"${flat}"`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

/**
 * The tells of a page that renders in the browser rather than on disk: assets
 * or scripts the browser has to fetch or run, an empty mount element, and a
 * document that renders less than half the text it is supposed to state.
 *
 * The floor is derived from the contract rather than being a magic number: a
 * page missing more than half its own copy is not a page with a gap in it, it
 * is a shell.
 */
function findShellProblems(contract: PageContract, html: string): string[] {
  const problems: string[] = [];

  const external = findExternalReferences(html);
  if (external.length > 0) {
    problems.push(
      `needs the browser to fetch or run something, so it is not self-contained: ${external.join(", ")}`,
    );
  }

  const mount = /<(div|main)\b[^>]*\bid="(?:root|app)"[^>]*>\s*<\/\1\s*>/i.exec(html);
  if (mount) {
    problems.push(`carries an empty mount element (${mount[0]}) — that is a client-rendered shell`);
  }

  const required = contract.text.join(" ").length;
  const rendered = extractRenderedText(html).length;
  if (rendered * 2 < required) {
    problems.push(
      `renders ${rendered} characters of text without JavaScript, less than half the ${required} ` +
        `it must state — the output looks like a shell hydrated by JavaScript`,
    );
  }

  return problems;
}

/** Everything wrong with one built page, in the order a reader would fix it. */
export function verifyPage(page: BuiltPage): string[] {
  const { contract, file, html } = page;
  if (file === null) {
    return [
      `no prerendered HTML for ${contract.route} — looked for ${pageFileCandidates(contract.route).join(" and ")}`,
    ];
  }

  const problems: string[] = [];

  if (!html.trimStart().startsWith("<!DOCTYPE html>")) {
    problems.push("does not start with <!DOCTYPE html>, so it is not a whole document");
  }

  problems.push(...findShellProblems(contract, html));

  const text = extractRenderedText(html);
  for (const wanted of contract.text) {
    if (!text.includes(normalize(wanted))) {
      problems.push(`copy missing from the rendered text: ${quote(wanted)}`);
    }
  }

  for (const fragment of contract.markup) {
    if (!html.includes(fragment)) problems.push(`markup missing: ${quote(fragment)}`);
  }

  for (const href of contract.links) {
    if (!html.includes(`href="${href}"`)) problems.push(`link missing: ${quote(href)}`);
  }

  for (const href of contract.absentLinks) {
    if (html.includes(`href="${href}"`)) problems.push(`links to itself: ${quote(href)}`);
  }

  for (const { what, pattern, expected } of contract.counts) {
    const found = html.match(pattern)?.length ?? 0;
    if (found !== expected) {
      problems.push(`expected ${expected} ${what}${expected === 1 ? "" : "s"}, found ${found}`);
    }
  }

  return problems;
}

export type PageResult = { route: string; label: string; problems: string[] };

/** Every built page against its contract. An empty problems list is the promise. */
export function verifyPrerendered(pages: BuiltPage[]): PageResult[] {
  return pages.map((page) => ({
    route: page.contract.route,
    label: page.contract.label,
    problems: verifyPage(page),
  }));
}

/** React escapes these five in text it renders; the markup fragments must match. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}
