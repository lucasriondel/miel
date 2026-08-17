import { describe, expect, test } from "bun:test";
import {
  DEV_GOOGLE_REDIRECT_URI,
  GOOGLE_OAUTH_CALLBACK_PATH,
  GOOGLE_OAUTH_ENV_KEYS,
  GOOGLE_OAUTH_SETUP_STEPS,
} from "./googleOAuthSetup";

// Issue #138. Three surfaces tell an operator how to produce the OAuth client
// miel signs into Gmail with — the README, the landing page's guide and the
// onboarding gate's first step — and the two that render walk through these
// steps rather than restating them. So what is asserted here is what a reader
// acts on: the console labels, the redirect URI, and the consent-screen mode
// that decides whether their own address may sign in at all.
const details = GOOGLE_OAUTH_SETUP_STEPS.map((step) => step.detail);
const all = GOOGLE_OAUTH_SETUP_STEPS.map((step) => `${step.title}. ${step.detail}`).join("\n");

/** The index of the step whose title or detail matches, or -1. */
const stepMatching = (pattern: RegExp) =>
  GOOGLE_OAUTH_SETUP_STEPS.findIndex(
    (step) => pattern.test(step.title) || pattern.test(step.detail),
  );

describe("the module", () => {
  /* The landing page reaches core only through leaf subpaths, so that it pulls
     in none of the db or env code (its `packageContract.test.ts` enforces it).
     A walkthrough it could not import would be a walkthrough it restated. */
  test("is a leaf subpath of the package, which is how the landing page reads it", async () => {
    const manifest = (await import("../package.json")) as unknown as {
      exports: Record<string, string>;
    };
    expect(manifest.exports["./googleOAuthSetup"]).toBe("./src/googleOAuthSetup.ts");
  });

  test("imports nothing, so importing it costs a reader's page nothing", async () => {
    const source = await Bun.file(new URL("./googleOAuthSetup.ts", import.meta.url)).text();
    expect(source).not.toMatch(/^import /m);
  });
});

describe("the walkthrough's shape", () => {
  test("is an ordered list, every step titled and explained", () => {
    expect(GOOGLE_OAUTH_SETUP_STEPS.length).toBeGreaterThanOrEqual(5);
    for (const step of GOOGLE_OAUTH_SETUP_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.detail.length).toBeGreaterThan(0);
    }
  });

  test("titles are unique, so a surface can key its list on them", () => {
    const titles = GOOGLE_OAUTH_SETUP_STEPS.map((step) => step.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  /* Rendered as text in the onboarding dialog and as prose on the landing page,
     neither of which runs a Markdown pass — a backtick typed out of README
     habit would reach both readers as a backtick. The README is the one surface
     that may dress these facts up, and it does that in its own file. */
  test("carries no Markdown, since two of its three surfaces render it as text", () => {
    for (const text of [...GOOGLE_OAUTH_SETUP_STEPS.map((step) => step.title), ...details]) {
      expect(text).not.toContain("`");
      expect(text).not.toMatch(/\*\*|\[.+\]\(.+\)/);
    }
  });
});

describe("the order an operator performs them in", () => {
  test("creates the project, then enables the API on it", () => {
    expect(stepMatching(/project/i)).toBe(0);
    expect(stepMatching(/Gmail API/)).toBe(1);
  });

  test("configures consent before creating the client, since the client needs it", () => {
    const consent = stepMatching(/consent screen/i);
    const client = stepMatching(/Web application/);
    expect(consent).toBeGreaterThan(-1);
    expect(client).toBeGreaterThan(consent);
  });

  test("registers the redirect URI on the client, then fills in the environment", () => {
    const redirect = stepMatching(/redirect URI/i);
    const env = stepMatching(/GOOGLE_CLIENT_SECRET/);
    expect(redirect).toBeGreaterThan(stepMatching(/Web application/));
    expect(env).toBeGreaterThan(redirect);
    // The variables are read once at startup, so the walkthrough has to end
    // with the restart or the gate the reader is looking at never clears.
    expect(GOOGLE_OAUTH_SETUP_STEPS.at(-1)!.detail).toMatch(/restart/i);
  });
});

describe("the facts a reader gets wrong without being told", () => {
  test("names the console sections rather than saying only where the values end up", () => {
    expect(all).toContain("APIs & Services");
    expect(all).toMatch(/Credentials/);
    expect(all).toMatch(/Library/);
  });

  // Testing mode is what the scopes callout already assumes: a client left
  // unverified refuses every address that is not a listed test user.
  test("says the consent screen stays External and in Testing, with self as a test user", () => {
    const consent = GOOGLE_OAUTH_SETUP_STEPS[stepMatching(/consent screen/i)]!.detail;
    expect(consent).toMatch(/External/);
    expect(consent).toMatch(/Testing/);
    expect(consent).toMatch(/test user/i);
    expect(consent).toMatch(/access_denied/);
  });

  test("gives the dev redirect URI verbatim, which is the value that must match", () => {
    expect(DEV_GOOGLE_REDIRECT_URI).toBe(`http://localhost:3001${GOOGLE_OAUTH_CALLBACK_PATH}`);
    expect(all).toContain(DEV_GOOGLE_REDIRECT_URI);
  });

  // `redirect_uri_mismatch` is the failure this step exists to prevent, and it
  // surfaces at Google before miel is ever reached, so nothing in the app can
  // explain it after the fact.
  test("warns that the registered URI and the variable must agree exactly", () => {
    const redirect = GOOGLE_OAUTH_SETUP_STEPS[stepMatching(/redirect URI/i)]!.detail;
    expect(redirect).toMatch(/redirect_uri_mismatch/);
    expect(redirect).toContain("GOOGLE_REDIRECT_URI");
  });

  test("names every variable the server reads, and no credential that is not one", () => {
    expect(GOOGLE_OAUTH_ENV_KEYS).toEqual([
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_REDIRECT_URI",
    ]);
    for (const key of GOOGLE_OAUTH_ENV_KEYS) expect(all).toContain(key);
    // No AI credential is an environment variable (#109), so a walkthrough that
    // sends someone to .env must not imply one is set there too.
    expect(all).not.toMatch(/CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY/);
  });

  // The steps are a public document by the time they reach the landing page, so
  // an example that looks like a real client id is the one thing they cannot
  // carry — and a reader who copies one gets `invalid_client` rather than help.
  test("carries no example client id or secret to be copied by mistake", () => {
    expect(all).not.toMatch(/\d{6,}-[a-z0-9]{10,}\.apps\.googleusercontent\.com/);
    expect(all).not.toMatch(/GOCSPX-/);
  });
});
