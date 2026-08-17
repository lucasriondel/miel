import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  MissingBuildError,
  PAGE_CONTRACTS,
  PUBLIC_DIR,
  type PageContract,
  contractFor,
  extractRenderedText,
  pageFileCandidates,
  readBuiltPages,
  verifyPage,
} from "./verifyPrerendered";
import { SCOPE_DISCLOSURES } from "../content/scopes";
import {
  CLAUDE_DISCLOSURE,
  CONTACT_EMAIL,
  GITHUB_URL,
  HOME,
  SITE_NAME,
  allHomeText,
} from "../content/site";
import { HOME_PATH } from "../content/nav";
import { PRIVACY } from "../content/privacy";
import { TERMS } from "../content/terms";

/**
 * The checker itself is exercised here on synthetic HTML, so this file needs no
 * build. The real built pages are checked by `scripts/verify-prerendered.ts`,
 * which runs at the end of `bun run build`.
 */

describe("extractRenderedText", () => {
  test("reads the text a browser would show, across tags and React's separators", () => {
    const html = `<p>Miel<!-- --> is open source.</p><p>Second line.</p>`;
    expect(extractRenderedText(html)).toBe("Miel is open source. Second line.");
  });

  test("decodes the entities React escapes, so copy compares as it was written", () => {
    const html = `<p>Gmail&#x27;s bin &amp; Google&#x27;s &quot;consent screen&quot;</p>`;
    expect(extractRenderedText(html)).toBe(`Gmail's bin & Google's "consent screen"`);
  });

  /**
   * The whole point of the check: copy that exists only in a hydration payload
   * is not text on the page, and must not count as present.
   */
  test("ignores text that only exists inside a script or style", () => {
    const html = `<body><div id="root"></div><script>window.__DATA__="Self-hosted Gmail triage"</script><style>.a{content:"hidden"}</style></body>`;
    expect(extractRenderedText(html)).toBe("");
  });
});

const DEMO: PageContract = {
  route: "/demo",
  label: "demo page",
  text: ["Hello world", "Second paragraph"],
  markup: ["<main>"],
  links: ["/other", "mailto:someone@example.com"],
  absentLinks: ["/demo"],
  counts: [{ what: "top-level heading", pattern: /<h1[\s>]/g, expected: 1 }],
};

const DEMO_HTML =
  `<!DOCTYPE html><html><body><main><h1>Hello world</h1><p>Second paragraph</p>` +
  `<a href="/other">Other</a><a href="mailto:someone@example.com">Mail</a></main></body></html>`;

function page(html: string, contract: PageContract = DEMO) {
  return verifyPage({ contract, file: `${contract.route}.html`, html });
}

describe("verifyPage", () => {
  test("passes a page that carries everything its contract requires", () => {
    expect(page(DEMO_HTML)).toEqual([]);
  });

  test("reports copy the page does not render", () => {
    const problems = page(DEMO_HTML.replace("<p>Second paragraph</p>", ""));
    expect(problems.join("\n")).toContain("Second paragraph");
  });

  test("reports copy that is present in the bytes but not in the rendered text", () => {
    const hidden = DEMO_HTML.replace(
      "<p>Second paragraph</p>",
      `<script>var x = "Second paragraph"</script>`,
    );
    expect(page(hidden).join("\n")).toContain("Second paragraph");
  });

  test("reports a missing link", () => {
    expect(page(DEMO_HTML.replace('href="/other"', 'href="/elsewhere"')).join("\n")).toContain(
      "/other",
    );
  });

  test("reports a page that links to itself", () => {
    expect(page(DEMO_HTML.replace('href="/other"', 'href="/demo"')).join("\n")).toContain(
      "links to itself",
    );
  });

  test("reports missing structural markup", () => {
    expect(page(DEMO_HTML.replace("<main>", "<div>")).join("\n")).toContain("<main>");
  });

  test("reports an element count that no longer matches", () => {
    expect(page(DEMO_HTML.replace("<h1>Hello world</h1>", "")).join("\n")).toContain(
      "top-level heading",
    );
  });

  test("reports a document that is not a full HTML document", () => {
    expect(page(DEMO_HTML.replace("<!DOCTYPE html>", "")).join("\n")).toContain("<!DOCTYPE html>");
  });

  test("reports a page with no built file at all", () => {
    expect(verifyPage({ contract: DEMO, file: null, html: "" }).join("\n")).toContain(
      "no prerendered HTML",
    );
  });
});

describe("verifyPage against a client-rendered shell", () => {
  const shell =
    `<!DOCTYPE html><html><head><title>Miel</title></head><body><div id="root"></div>` +
    `<script>window.__DATA__=${JSON.stringify(allHomeText())}</script></body></html>`;

  const problems = verifyPage({
    contract: contractFor(HOME_PATH),
    file: "index.html",
    html: shell,
  }).join("\n");

  test("fails when the page is an empty shell hydrated by JavaScript", () => {
    expect(problems).toContain("shell");
  });

  test("names the script the page would have to run", () => {
    expect(problems).toContain("<inline script>");
  });

  test("does not credit the copy carried in the hydration payload", () => {
    expect(problems).toContain(HOME.tagline);
  });
});

describe("page contracts", () => {
  test("cover the three prerendered routes", () => {
    expect(PAGE_CONTRACTS.map((contract) => contract.route)).toEqual([
      HOME_PATH,
      PRIVACY.path,
      TERMS.path,
    ]);
  });

  const home = contractFor(HOME_PATH);

  test("assert the app name on the homepage", () => {
    expect(home.text).toContain(SITE_NAME);
  });

  /**
   * Derived, not restated: a scope added to `SCOPE_DISCLOSURES` extends this
   * check by itself, which is what stops the built page from quietly dropping a
   * permission the app requests.
   */
  test("assert every scope's consent wording and feature, from the disclosure module", () => {
    expect(SCOPE_DISCLOSURES.length).toBeGreaterThan(0);
    for (const row of SCOPE_DISCLOSURES) {
      expect(home.text).toContain(row.consentWording);
      expect(home.text).toContain(row.feature);
      expect(home.text).toContain(row.permission);
      expect(home.text).toContain(row.scope);
    }
  });

  test("assert the Anthropic disclosure on the homepage", () => {
    expect(home.text).toContain(CLAUDE_DISCLOSURE.heading);
    for (const paragraph of CLAUDE_DISCLOSURE.body) {
      expect(home.text).toContain(paragraph);
    }
  });

  test("assert the contact address and the GitHub link on every page", () => {
    for (const contract of PAGE_CONTRACTS) {
      expect(contract.text).toContain(CONTACT_EMAIL);
      expect(contract.links).toContain(`mailto:${CONTACT_EMAIL}`);
      expect(contract.links).toContain(GITHUB_URL);
    }
  });

  test("assert the cross-links between the three pages, in both directions", () => {
    expect(home.links).toContain(PRIVACY.path);
    expect(home.links).toContain(TERMS.path);

    expect(contractFor(PRIVACY.path).links).toEqual(
      expect.arrayContaining([HOME_PATH, TERMS.path]),
    );
    expect(contractFor(TERMS.path).links).toEqual(
      expect.arrayContaining([HOME_PATH, PRIVACY.path]),
    );
  });

  test("refuse a page a link to itself", () => {
    for (const contract of PAGE_CONTRACTS) {
      expect(contract.absentLinks).toContain(contract.route);
    }
  });
});

describe("pageFileCandidates", () => {
  test("accepts either shape the prerenderer writes a clean URL as", () => {
    expect(pageFileCandidates("/")).toEqual(["index.html"]);
    expect(pageFileCandidates("/privacy")).toEqual([join("privacy", "index.html"), "privacy.html"]);
  });
});

describe("readBuiltPages", () => {
  test("says which command to run when there is no build to check", () => {
    const missing = join(tmpdir(), "miel-landing-not-built");
    rmSync(missing, { recursive: true, force: true });
    expect(() => readBuiltPages(missing)).toThrow(MissingBuildError);
    expect(() => readBuiltPages(missing)).toThrow(/bun run build/);
  });

  test("says the same when the directory exists but holds no page", () => {
    const empty = mkdtempSync(join(tmpdir(), "miel-landing-empty-"));
    try {
      expect(() => readBuiltPages(empty)).toThrow(/bun run build/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  test("reads each contract's page from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "miel-landing-built-"));
    try {
      writeFileSync(join(dir, "index.html"), "<!DOCTYPE html><html></html>");
      const pages = readBuiltPages(dir);
      expect(pages).toHaveLength(PAGE_CONTRACTS.length);
      expect(pages[0]?.html).toContain("<!DOCTYPE html>");
      // The legal pages were not written, and are reported rather than skipped.
      expect(pages[1]?.file).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const script = resolve(import.meta.dirname, "../..", "scripts", "verify-prerendered.ts");

describe("scripts/verify-prerendered.ts", () => {
  test("exits with a clear instruction, not a stack trace, when nothing is built", () => {
    const missing = join(tmpdir(), "miel-landing-not-built");
    rmSync(missing, { recursive: true, force: true });
    const run = Bun.spawnSync(["bun", script, missing]);
    expect(run.exitCode).toBe(1);
    const output = run.stderr.toString() + run.stdout.toString();
    expect(output).toContain("bun run build");
    expect(output).not.toContain("at <anonymous>");
  });

  test.skipIf(!existsSync(PUBLIC_DIR))("passes against the built output", () => {
    const run = Bun.spawnSync(["bun", script]);
    expect(run.stderr.toString() + run.stdout.toString()).not.toContain("✗");
    expect(run.exitCode).toBe(0);
  });
});
