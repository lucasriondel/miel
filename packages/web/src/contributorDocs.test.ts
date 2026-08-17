import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
// The provider a fresh install runs on, read from the catalogue rather than
// restated here — the point of these assertions is that the prose tracks it.
import { DEFAULT_PROVIDER } from "@miel/core/providerModels";
// The OAuth setup steps the onboarding dialog and the landing page render
// (#138). The README says the same things in Markdown of its own, so this is
// what it is checked against.
import {
  DEV_GOOGLE_REDIRECT_URI,
  GOOGLE_OAUTH_CALLBACK_PATH,
  GOOGLE_OAUTH_ENV_KEYS,
  GOOGLE_OAUTH_SETUP_STEPS,
} from "@miel/core/googleOAuthSetup";

// Issue #102. Everything a contributor needs — the setup, the checks a pull
// request is gated on, the conventions — lived only in CLAUDE.md, which is
// addressed to agents and which a person has no reason to open. CONTRIBUTING.md
// and SECURITY.md are the human-facing pair, and .github/ carries the templates.
//
// The file sits beside projectDocs.test.ts, which guards the same class of
// failure: documentation that is wrong is worse than documentation that is
// missing, because it is followed. So the facts checked here are *derived* from
// what they describe — the gated checks come out of the CI workflow, the
// disclosure address out of the landing page's contact constant — and a change
// to either fails this file rather than quietly outdating the prose.
const repoRoot = resolve(import.meta.dir, "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const contributing = read("CONTRIBUTING.md");
const security = read("SECURITY.md");
const pullRequestTemplate = read(".github/pull_request_template.md");
const workflow = read(".github/workflows/ci.yml");

/** `- run: bun run lint` -> `bun run lint`. The gate, as CI actually runs it. */
const GATED_CHECKS = [...workflow.matchAll(/^\s*- run: (bun run [\w:]+)$/gm)].map((m) => m[1]!);

/** The one public address the site already publishes, from `site.ts`. */
const CONTACT_EMAIL = read("packages/landing-page/src/content/site.ts").match(
  /CONTACT_EMAIL = "([^"]+)"/,
)?.[1];

/** A `## …` section's body, up to the next `## `. */
const section = (source: string, heading: string) => {
  const start = source.indexOf(`## ${heading}`);
  if (start === -1) return undefined;
  const body = source.slice(start + heading.length);
  const end = body.indexOf("\n## ");
  return end === -1 ? body : body.slice(0, end);
};

const issueTemplate = (file: string) =>
  Bun.YAML.parse(read(`.github/ISSUE_TEMPLATE/${file}`)) as {
    name: string;
    description: string;
    labels?: string[];
    body: {
      type: string;
      id?: string;
      attributes?: Record<string, unknown>;
      validations?: unknown;
    }[];
  };

describe("the checks this repo gates on", () => {
  // Everything below compares against this list, so an empty match — a renamed
  // step, a reworded workflow — would make those assertions pass vacuously.
  test("are readable off the workflow, and are the four documented ones", () => {
    expect(GATED_CHECKS).toEqual([
      "bun run lint",
      "bun run format:check",
      "bun run typecheck",
      "bun run test",
    ]);
  });
});

describe("CONTRIBUTING.md", () => {
  test("exists", () => {
    expect(existsSync(join(repoRoot, "CONTRIBUTING.md"))).toBe(true);
  });

  test("gets the reader from a clone to a running stack", () => {
    expect(contributing).toContain("bun install");
    expect(contributing).toContain("docker compose -f docker-compose.dev.yml up -d");
    expect(contributing).toContain("bun dev");
    expect(contributing).toContain("cp .env.example .env");
    expect(contributing).toContain("http://localhost:3000/app");
  });

  test.each(GATED_CHECKS)("names `%s`, which a pull request is gated on", (command) => {
    expect(contributing).toContain(command);
  });

  // The verify form, not the rewrite form: a contributor reading this is being
  // told what CI will run, and `bun run format` would pass while CI fails.
  test("tells the reader the checks are what CI runs on every pull request", () => {
    expect(contributing).toMatch(/pull request/i);
    expect(contributing).toContain("bun run format:check");
  });

  test("states the conventions rather than leaving them to be inferred", () => {
    expect(contributing).toContain("packages/core/src/index.ts");
    expect(contributing).toMatch(/routes?[^.]*(delegate|thin)/i);
    expect(contributing).toContain("google/");
    expect(contributing).toMatch(/claude/i);
  });

  // The one genuinely surprising fact about this tree: a vendored file has no
  // version to resolve, so the "run install to get the fix" reflex does nothing.
  test("carries the vendored gousse-ui caveat, with the command that updates one", () => {
    expect(contributing).toMatch(/bunx shadcn@latest add @gousse\//);
    expect(contributing).toMatch(/(never|do not|don't)[^.]*`?bun install`?/i);
    expect(contributing).toContain("packages/web/src/components/ui");
  });

  test("links to CLAUDE.md for the full detail instead of copying it", () => {
    expect(contributing).toContain("CLAUDE.md");
    expect(contributing.length).toBeLessThan(read("CLAUDE.md").length);
  });

  test("points at the disclosure process rather than fielding security in issues", () => {
    expect(contributing).toContain("SECURITY.md");
  });
});

describe("SECURITY.md", () => {
  test("exists", () => {
    expect(existsSync(join(repoRoot, "SECURITY.md"))).toBe(true);
  });

  // Reusing the address the site already publishes: a second one is a second
  // inbox to forget to read.
  test("gives the disclosure address the landing page already publishes", () => {
    expect(CONTACT_EMAIL).toBeDefined();
    expect(security).toContain(CONTACT_EMAIL!);
    expect(security).toContain(`mailto:${CONTACT_EMAIL}`);
  });

  test("asks for private disclosure rather than a public issue", () => {
    expect(security).toMatch(/(do not|don't) open (a )?public/i);
  });

  test("says what is in scope, and why this app warrants a policy", () => {
    expect(security).toMatch(/scope/i);
    expect(security).toMatch(/refresh token/i);
    expect(security).toMatch(/self-host/i);
  });
});

describe("the issue templates", () => {
  const FORMS = ["bug_report.yml", "feature_request.yml"];

  test.each(FORMS)("%s exists", (file) => {
    expect(existsSync(join(repoRoot, ".github/ISSUE_TEMPLATE", file))).toBe(true);
  });

  // GitHub renders a form only if it parses and carries the required top-level
  // keys; anything else lands in the repo as a broken template nobody sees.
  test.each(FORMS)("%s parses, and has the keys GitHub requires", (file) => {
    const form = issueTemplate(file);
    expect(form.name.length).toBeGreaterThan(0);
    expect(form.description.length).toBeGreaterThan(0);
    expect(form.body.length).toBeGreaterThan(0);
  });

  test.each(FORMS)("%s uses only field types GitHub knows", (file) => {
    const KNOWN = ["markdown", "input", "textarea", "dropdown", "checkboxes"];
    for (const field of issueTemplate(file).body) {
      expect(KNOWN).toContain(field.type);
      expect(field.attributes).toBeDefined();
    }
  });

  // A template long enough to feel like paperwork suppresses the report it was
  // meant to collect. Four fields is a form; a dozen is a tax return.
  test.each(FORMS)("%s stays short enough that people fill it in", (file) => {
    expect(issueTemplate(file).body.length).toBeLessThanOrEqual(5);
  });

  test("the bug report asks what happened, and how to reproduce it", () => {
    const text = JSON.stringify(issueTemplate("bug_report.yml"));
    expect(text).toMatch(/reproduce/i);
    expect(text).toMatch(/expect/i);
  });

  test("the feature request asks for the problem, not just the solution", () => {
    const text = JSON.stringify(issueTemplate("feature_request.yml"));
    expect(text).toMatch(/problem/i);
  });

  // Security reports have their own route; the chooser is where someone about
  // to paste a vulnerability into a public issue can be caught.
  test("the chooser sends security reports to the disclosure address", () => {
    const config = Bun.YAML.parse(read(".github/ISSUE_TEMPLATE/config.yml")) as {
      blank_issues_enabled: boolean;
      contact_links: { name: string; url: string; about: string }[];
    };
    expect(typeof config.blank_issues_enabled).toBe("boolean");
    const disclosureLink = config.contact_links.find((link) => /security/i.test(link.name));
    expect(disclosureLink).toBeDefined();
    expect(disclosureLink!.url).toContain(CONTACT_EMAIL!);
  });
});

describe("the pull request template", () => {
  test("exists", () => {
    expect(existsSync(join(repoRoot, ".github/pull_request_template.md"))).toBe(true);
  });

  test.each(GATED_CHECKS)("reminds the contributor to run `%s`", (command) => {
    expect(pullRequestTemplate).toContain(command);
  });

  test("stays short", () => {
    expect(pullRequestTemplate.split("\n").length).toBeLessThanOrEqual(30);
  });
});

describe("README.md's Contributing section", () => {
  const contributingSection = section(read("README.md"), "Contributing");

  test("is still a section", () => {
    expect(contributingSection).toBeDefined();
  });

  test("points at CONTRIBUTING.md and SECURITY.md", () => {
    expect(contributingSection).toContain("CONTRIBUTING.md");
    expect(contributingSection).toContain("SECURITY.md");
  });

  // Two copies of the gate is one copy that goes stale. The commands live in
  // CONTRIBUTING.md now.
  test.each(GATED_CHECKS)("no longer restates `%s`", (command) => {
    expect(contributingSection).not.toContain(command);
  });
});

// Issue #112. `SETTING_DEFAULTS` ships a provider for all three tasks, so a
// fresh install triages on its first sync — through the local CLI, which sends
// sender, subject and snippet out. Both setup documents said the opposite:
// that nothing is triaged until someone picks a provider. Read the wrong way
// round it is a privacy claim that is not true, and it also tells a reader that
// the token the default provider needs is optional.
describe("what a fresh install triages with", () => {
  const readme = read("README.md");

  test.each([
    ["README.md", readme],
    ["CONTRIBUTING.md", contributing],
  ])("%s does not claim a fresh install triages nothing", (_name, doc) => {
    expect(doc).not.toMatch(/nothing gets triaged/i);
    expect(doc).not.toMatch(/nothing triages until/i);
    expect(doc).not.toMatch(/until one is configured/i);
  });

  test("the README names the shipped default by the id the settings row holds", () => {
    const line = readme
      .split("\n")
      .find((l) => l.includes(DEFAULT_PROVIDER) && /\bdefault\b/i.test(l));
    expect(line).toBeDefined();
  });

  // No AI credential is an env var any more, so the env table must not list one:
  // a row there is an instruction to fill it in, and nothing would read it.
  test("the README's env table lists no AI credential", () => {
    const rows = readme.split("\n").filter((line) => line.startsWith("| `"));
    for (const row of rows) {
      expect(row).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
      expect(row).not.toMatch(/ANTHROPIC_API_KEY|OPENAI_API_KEY|GOOGLE_API_KEY/);
    }
  });

  // The reader still has to be told the token is required and where it goes —
  // `claude-code` is what a fresh install triages with, and the first sync fails
  // without it. What changed is the destination: Settings, not `.env`.
  test("the README sends the default provider's token to Settings, not to .env", () => {
    expect(readme).toContain("claude setup-token");
    const line = readme
      .split("\n")
      .find((l) => l.includes("claude setup-token") && /credentials/i.test(l));
    expect(line).toBeDefined();
  });

  // docker-compose.yml passes the API no AI credential at all, so the quickstart
  // must not imply one is set there.
  test("the README's Docker quickstart does not ask for a token in the environment", () => {
    const docker = section(readme, "Running with Docker");
    expect(docker).toBeDefined();
    expect(docker).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
  });

  test("the compose file that quickstart runs passes no AI credential", () => {
    const compose = read("docker-compose.yml");
    expect(compose).not.toMatch(/^\s*CLAUDE_CODE_OAUTH_TOKEN:/m);
    expect(compose).not.toMatch(/^\s*(ANTHROPIC|OPENAI|GOOGLE)_API_KEY:/m);
    expect(compose).not.toMatch(/^\s*WORP_/m);
  });
});

// Issue #138. The one prerequisite nothing installs: an OAuth client made by
// hand in Google's console. Three surfaces explain it — this README, the
// landing page's guide and the onboarding gate's first step — and the two that
// render import the steps from core. The README is the source of truth for the
// facts and dresses them up in Markdown of its own, which is why it is checked
// against that list here rather than sharing it: what must agree is the order
// and the values, not the wording.
describe("the Google OAuth walkthrough", () => {
  const readme = read("README.md");

  /** A `### …` subsection's body, up to the next heading of any level. */
  const subsection = (heading: string) => {
    const start = readme.indexOf(`### ${heading}`);
    if (start === -1) return undefined;
    const body = readme.slice(start + heading.length + 4);
    const end = body.search(/^#{2,3} /m);
    return end === -1 ? body : body.slice(0, end);
  };

  const walkthrough = subsection("Creating the Google OAuth client");

  test("is a section of its own, not a table cell", () => {
    expect(walkthrough).toBeDefined();
  });

  test("numbers the steps, in the order core's list puts them", () => {
    // The README is allowed its own dressing — a variable in backticks, a label
    // in bold — so the titles are compared with the Markdown taken back off.
    const plain = walkthrough!.replaceAll("`", "").replaceAll("**", "");
    const positions = GOOGLE_OAUTH_SETUP_STEPS.map((step) => plain.indexOf(step.title));
    expect(positions).not.toContain(-1);
    expect(positions).toEqual([...positions].toSorted((a, b) => a - b));
    // A numbered list, since the order is the whole point of it.
    expect(walkthrough).toMatch(/^1\. /m);
  });

  test("carries the facts each step turns on", () => {
    // The consent screen's mode, which decides whether the reader's own address
    // may sign in at all.
    expect(walkthrough).toMatch(/External/);
    expect(walkthrough).toMatch(/Testing/);
    expect(walkthrough).toMatch(/test user/i);
    expect(walkthrough).toMatch(/Web application/);
    // The value Google refuses the sign-in over when it is off by a character.
    expect(walkthrough).toContain(DEV_GOOGLE_REDIRECT_URI);
    expect(walkthrough).toMatch(/redirect_uri_mismatch/);
    for (const key of GOOGLE_OAUTH_ENV_KEYS) expect(walkthrough).toContain(key);
    // Read once at startup: a reader who does not restart sees no change.
    expect(walkthrough).toMatch(/restart/i);
  });

  // A deployment's redirect URI is its own host, so the README hands that half
  // to the document that knows the deployed topology instead of guessing it.
  test("sends a deployment to DEPLOY.md for its own redirect URI", () => {
    expect(walkthrough).toContain("DEPLOY.md");
    expect(read("DEPLOY.md")).toContain(GOOGLE_OAUTH_CALLBACK_PATH);
  });

  // The dev URI is a default the API actually applies, not a suggestion.
  test("registers the URI an unconfigured server really sends Google", () => {
    expect(read(".env.example")).toContain(`GOOGLE_REDIRECT_URI=${DEV_GOOGLE_REDIRECT_URI}`);
  });

  // The row that used to be the whole explanation. It stays — the table is
  // where a reader looks up a key — but it points at the walkthrough rather
  // than trying to be one.
  test("is what the env table's Google row points at", () => {
    const row = readme.split("\n").find((line) => line.startsWith("| `GOOGLE_CLIENT_ID`"));
    expect(row).toBeDefined();
    expect(row).toContain("#creating-the-google-oauth-client");
  });

  test("leaks no example client id or secret for a reader to copy", () => {
    expect(walkthrough).not.toMatch(/\d{6,}-[a-z0-9]{10,}\.apps\.googleusercontent\.com/);
    expect(walkthrough).not.toMatch(/GOCSPX-/);
  });
});
