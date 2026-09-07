import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Issue #99. Making the repo public means a stranger reads it, and what they
// found until this file existed was the maintainer's own inbox: a personal Gmail
// address in the deployment notes and hardcoded into three seed scripts, plus a
// personal hostname written into source rather than configuration — and, beside
// both, bootstrap commands for a CLI (`gog`) the backend rewrite deleted.
//
// It sits beside publicInstall.test.ts (#74), which guards the other half of
// "can someone else run this": that one is about what a clone needs to install,
// this one about whose identity the tree carries.
const repoRoot = resolve(import.meta.dir, "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

/** Files whose bytes are not text; nothing here can hide an address. */
const BINARY = /\.(?:webp|png|jpe?g|gif|ico|woff2?|ttf|eot|pdf)$/;

/** Every tracked file, which is exactly the set that goes public. */
const TRACKED = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: repoRoot })
  .stdout.toString()
  .split("\0")
  .filter((path) => path.length > 0 && !BINARY.test(path));

/** This file names the patterns it forbids, so it cannot be scanned for them. */
const SELF = "packages/web/src/publicRepoHygiene.test.ts";

const textFiles = TRACKED.filter((path) => path !== SELF);

function filesMatching(pattern: RegExp): string[] {
  return textFiles.filter((path) => pattern.test(read(path)));
}

describe("personal identifiers", () => {
  /**
   * The landing page's `CONTACT_EMAIL` is the deliberate exception: it is a
   * published contact address for the hosted instance, and site.test.ts asserts
   * it. Everything else — deployment notes, seed scripts — has no business
   * naming a real mailbox.
   *
   * The two files #102 added publish that same address rather than a second one,
   * and being Markdown and YAML they cannot import the constant. What keeps them
   * from drifting into a different mailbox is contributorDocs.test.ts, which
   * checks both against `site.ts`'s `CONTACT_EMAIL` — so they are listed here as
   * the published address, not as an identifier that leaked.
   */
  const CONTACT = [
    "packages/landing-page/src/content/site.ts",
    "packages/landing-page/src/content/site.test.ts",
    "SECURITY.md",
    ".github/ISSUE_TEMPLATE/config.yml",
  ];

  test("no tracked file carries a personal mailbox except the published contact address", () => {
    const address = /[A-Za-z0-9._%+-]+@gmail\.com/;
    expect(filesMatching(address).toSorted()).toEqual(CONTACT.toSorted());
  });
});

describe("the smoke and seed scripts", () => {
  const SCRIPTS = [
    "packages/api/scripts/smoke-api.ts",
    "packages/cli/scripts/smoke-cli.ts",
    "packages/cli/scripts/seed-apply.ts",
  ];

  /** The one name the scripts, the docs and this test agree on. */
  const VARIABLE = "MIEL_TEST_ACCOUNT";

  test.each(SCRIPTS)("%s takes the account it seeds from the environment", (path) => {
    expect(read(path)).toContain(`process.env.${VARIABLE}`);
  });

  /**
   * Read rather than run: all three scripts are dead on arrival today — they
   * import `syncAccountsFromGog` and `GogAdapter`, which the backend rewrite
   * removed from core, so bun fails to link them before a line executes. That
   * rot is #99's neighbour, not its subject; repairing the scripts against the
   * Effect Gmail services is its own change, and until it happens the guard can
   * only be asserted as source. What matters is that a missing variable is
   * named: the alternative was seeding against an address baked in by the
   * author — someone else's inbox — and failing later with an auth error that
   * names nothing the reader can set.
   */
  test.each(SCRIPTS)("%s names the variable and exits when it is unset", (path) => {
    const source = read(path);
    const guard = source.slice(source.indexOf(`process.env.${VARIABLE}`));
    expect(guard).toMatch(new RegExp(`console\\.error\\([\\s\\S]*${VARIABLE}`));
    expect(guard).toContain("process.exit(1)");
  });

  test.each(SCRIPTS)("%s tells the reader how to set it, in its usage line", (path) => {
    expect(read(path)).toMatch(new RegExp(`${VARIABLE}=\\S+ bun scripts/`));
  });
});

describe("the deployment notes", () => {
  const deployDoc = read("DEPLOY.md");

  /**
   * The backend rewrite replaced the gog CLI with the Gmail REST API and in-app
   * OAuth, so every `gog` line here is an instruction that cannot be followed —
   * worse than no instruction, because it reads as current.
   */
  test("document no gog command, since the binary is gone", () => {
    expect(deployDoc).not.toMatch(/\bgogcli\b/i);
    expect(deployDoc).not.toMatch(/\bgog\b/i);
  });

  test("describe the OAuth flow the app actually ships", () => {
    expect(deployDoc).toContain("GOOGLE_CLIENT_ID");
    expect(deployDoc).toContain("GOOGLE_CLIENT_SECRET");
    expect(deployDoc).toContain("/auth/google/callback");
    expect(deployDoc).toContain("Connect with Google");
  });
});

describe("the site host", () => {
  const topology = "packages/landing-page/src/deploy/topology.ts";

  /** Read off the source, so this file states no hostname of its own. */
  const defaultHost = /DEFAULT_SITE_HOST\s*=\s*"([^"]+)"/.exec(read(topology))?.[1];

  test("has one default, declared in the deploy topology module", () => {
    expect(defaultHost).toBeDefined();
  });

  /**
   * Self-hosting must not mean editing source. The default keeps the reference
   * deployment resolving to the same name, so the only places the literal is
   * allowed are the module that defines it, the sample environment, and the
   * worked deployment DEPLOY.md describes.
   */
  test("appears nowhere else in the tree but its default, the sample env and the notes", () => {
    const literal = new RegExp(defaultHost!.replaceAll(".", "\\."));
    expect(filesMatching(literal).toSorted()).toEqual([".env.example", "DEPLOY.md", topology]);
  });

  test("is settable as an environment variable, and the sample env says so", () => {
    expect(read(".env.example")).toContain("SITE_HOST");
    expect(read("DEPLOY.md")).toContain("SITE_HOST");
  });
});
