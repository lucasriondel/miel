import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Issue #75. `CLAUDE.md` is the file every agent reads before touching this
// repo, so a stale line there is repeated back as fact. The registry migration
// (#70–#74) invalidated its account of how the design system arrives, and the
// same paragraph had been claiming Tailwind 3 since before that.
//
// The checks read the *manifest* and `components.json` rather than restating
// their contents, so a version bump or a moved alias fails here instead of
// quietly drifting: the doc is only correct relative to what it describes.
const repoRoot = resolve(import.meta.dir, "../../..");
const packageRoot = resolve(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const claudeMd = read("CLAUDE.md");

const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const pins = { ...manifest.dependencies, ...manifest.devDependencies };

const componentsJson = JSON.parse(readFileSync(join(packageRoot, "components.json"), "utf8")) as {
  aliases: Record<string, string>;
  registries: Record<string, string>;
};

const designMd = read("packages/web/DESIGN.md");
const tokensCss = readFileSync(join(packageRoot, "src/styles/gousse/tokens.css"), "utf8");
const indexCss = readFileSync(join(packageRoot, "src/index.css"), "utf8");

const unique = (names: string[]) => [...new Set(names)];

/** `--gousse-accent: 220 120 40;` -> `accent`. Shadow ramps are pulled separately. */
const colorTokens = unique(
  [...tokensCss.matchAll(/--gousse-(?!shadow-)([a-z]+)\s*:/g)].map((m) => m[1]!),
);

/** `--gousse-shadow-md:` -> `md`. */
const shadowTokens = unique(
  [...tokensCss.matchAll(/--gousse-shadow-([a-z]+)\s*:/g)].map((m) => m[1]!),
);

/** The text above `## 1`, i.e. the one-line aesthetic summary. */
const designSummary = designMd.slice(0, designMd.indexOf("## 1."));

/** A `## n. …` section's body, up to the next `## `. */
const designSection = (heading: string) => {
  const body = designMd.slice(designMd.indexOf(`## ${heading}`) + 1);
  const end = body.indexOf("\n## ");
  return end === -1 ? body : body.slice(0, end);
};

/** The §1 table row documenting one token. */
const tokenRow = (name: string) =>
  designMd.split("\n").find((line) => line.startsWith(`| \`--gousse-${name}\``));

/** `--gousse-accent: 148 100 10; /* #94640a — web override, honey (light) *\/` -> `honey`. */
const accentFamily = indexCss.match(/--gousse-accent:[^;]*;\s*\/\*[^*]*?override,\s*([a-z]+)/)?.[1];

/** The same override read as hex, which is how §1's table states a value. */
const accentHexes = [...indexCss.matchAll(/--gousse-accent:[^;]*;\s*\/\*\s*(#[0-9a-f]{6})/g)].map(
  (m) => m[1]!,
);

/** The one line that lists the web stack, so a match elsewhere doesn't count. */
const webStackLine = claudeMd.split("\n").find((line) => line.startsWith("- Web:"));

/** `^4.3.2` -> `4`. */
const major = (range: string) => range.replace(/^[^\d]*/, "").split(".")[0];

describe("the web stack CLAUDE.md advertises", () => {
  test("there is a line listing it", () => {
    expect(webStackLine).toBeDefined();
  });

  // Tailwind is the one that mattered: 3 and 4 disagree about layers, about
  // where the config lives, and about whether `@source` is a thing at all —
  // exactly the ground the vendored stylesheets stand on.
  test.each([
    ["React", "react"],
    ["Vite", "vite"],
    ["Tailwind", "tailwindcss"],
    ["TanStack Query", "@tanstack/react-query"],
    ["React Router", "react-router"],
  ])("%s's major matches what packages/web pins", (label, pkg) => {
    const pinned = pins[pkg];
    expect(pinned).toBeDefined();
    expect(webStackLine).toContain(`${label} ${major(pinned!)}`);
  });
});

describe("how CLAUDE.md says the design system is consumed", () => {
  test("it points at the components.json that configures the registry", () => {
    expect(claudeMd).toContain("packages/web/components.json");
  });

  test("it names the registry the @gousse namespace resolves against", () => {
    expect(claudeMd).toContain(componentsJson.registries["@gousse"]);
  });

  // Derived from the alias, so moving where vendored components land breaks the
  // doc rather than silently outdating it.
  test("it names the directory the ui alias points at", () => {
    const uiDir = componentsJson.aliases.ui!.replace("@/", "src/");
    expect(claudeMd).toContain(`packages/web/${uiDir}`);
  });

  test("it gives the command that vendors an item", () => {
    expect(claudeMd).toMatch(/bunx shadcn@latest add @gousse\//);
  });

  // The behaviour change worth writing down: a copied file has no version to
  // resolve, so the usual "run install to get the fix" reflex does nothing.
  test("it states that vendored components do not update through bun install", () => {
    expect(claudeMd).toMatch(/vendored components (?:never|do not|don't)[^.]*`bun install`/i);
  });

  test("it says re-running the add is the way in, and that the diff gets reviewed", () => {
    expect(claudeMd).toMatch(/git diff/);
    expect(claudeMd.toLowerCase()).toContain("review");
  });

  test("it records that bun install needs no credentials", () => {
    expect(claudeMd).toMatch(/`bun install` needs no credential/i);
  });
});

// Issue #87. DESIGN.md is read before any restyling, so a token name it gets
// wrong is a name that gets typed into a component. The tokens are the vendored
// gousse-ui contract (§10) — re-running the add reintroduces `--gousse-*` — so
// the doc is what moves. Everything here is derived from the stylesheets, not
// restated, so the next rename fails the test instead of drifting.
describe("the color tokens DESIGN.md documents", () => {
  test("the stylesheet defines tokens and shadow ramps to check against", () => {
    expect(colorTokens.length).toBeGreaterThan(0);
    expect(shadowTokens.length).toBeGreaterThan(0);
  });

  // Otherwise a renumbered heading slices the whole file and every section
  // assertion below passes for the wrong reason.
  test.each(["1.", "2."])("§%s is a section this file can isolate", (heading) => {
    expect(designMd).toContain(`## ${heading}`);
    expect(designSection(heading)).not.toContain("\n## ");
  });

  test.each(colorTokens)("`--gousse-%s` is in the §1 table, with its utility", (name) => {
    expect(tokenRow(name)).toBeDefined();
    expect(tokenRow(name)).toContain(`gousse-${name}`);
  });

  test.each(shadowTokens)("`shadow-gousse-%s` is the ramp §2 names", (name) => {
    expect(designSection("2.")).toContain(`shadow-gousse-${name}`);
  });

  // Blunt on purpose: the only surviving `miel-` strings in the app are the
  // toaster's class names, and this doc names no class of the toaster's.
  test.each([...colorTokens, ...shadowTokens])(
    "no `miel-%s` reference survives anywhere in the doc",
    (name) => {
      expect(designMd).not.toContain(`miel-${name}`);
    },
  );

  test("it points at the sheets that define and map the tokens", () => {
    expect(designMd).toContain("styles/gousse/tokens.css");
    expect(designMd).toContain("styles/gousse/theme.css");
  });

  // Tailwind 4 is CSS-first: naming a config file sends a reader looking for a
  // file this package does not have.
  test("it names no Tailwind config file, since the package has none", () => {
    expect(
      ["tailwind.config.ts", "tailwind.config.js"].filter((f) => existsSync(join(packageRoot, f))),
    ).toEqual([]);
    expect(designMd).not.toContain("tailwind.config");
  });

  test("it records why the tokens keep the vendored prefix", () => {
    expect(designSection("1.")).toMatch(/renam/i);
    expect(designSection("1.")).toMatch(/vendored|registry/i);
  });
});

describe("the accent DESIGN.md describes", () => {
  test("index.css names the family it overrides the accent to", () => {
    expect(accentFamily).toBeDefined();
    expect(accentHexes).toHaveLength(2);
  });

  test("the one-line summary calls the accent what the app renders", () => {
    expect(designSummary).toContain(accentFamily!);
    // The colour it was before ab044af — the doc outlived that change once.
    expect(designSummary).not.toMatch(/blue/i);
  });

  test("the §1 accent row does too, down to the values index.css sets", () => {
    expect(tokenRow("accent")).toContain(accentFamily!);
    expect(tokenRow("accent")).not.toMatch(/blue/i);
    for (const hex of accentHexes) expect(tokenRow("accent")).toContain(hex);
  });

  // The override is the accent only; the medium-priority token is its own colour
  // and stays amber-gold, so the two rows can't collapse into one.
  test("the medium-priority row is still amber", () => {
    expect(tokenRow("medium")).toMatch(/amber/i);
    expect(tokenRow("accent")).not.toMatch(/amber-gold/i);
  });
});

describe("what no documentation file should still say", () => {
  /** Every doc a reader might follow, including the ones under packages/. */
  const DOCS = [...new Glob("**/*.md").scanSync({ cwd: repoRoot, dot: false })].filter(
    (path) => !path.includes("node_modules"),
  );

  const INSTALL_VERBS = ["bun add", "bun install", "npm install", "npm i ", "pnpm add", "yarn add"];

  test("the doc set is non-empty and includes the root instructions", () => {
    expect(DOCS).toContain("CLAUDE.md");
    expect(DOCS).toContain("packages/web/DESIGN.md");
  });

  // Past-tense history is fine and deliberate (DESIGN.md §10 keeps it). What
  // must not survive is a line a reader can *act* on: the package is gone from
  // the lockfile and the registry that served it wants a token nobody has.
  test.each(DOCS)("%s tells nobody to install the retired npm package", (path) => {
    const offending = read(path)
      .split("\n")
      .filter((line) => line.includes("@lucasriondel/gousse-ui"))
      .filter((line) => INSTALL_VERBS.some((verb) => line.includes(verb)));
    expect(offending).toEqual([]);
  });

  // Blunt on purpose, and the reason the section above says "authenticated npm
  // registry": a reader skimming for setup steps does not distinguish "needs a
  // private registry token" from "no longer needs" one. The file this repo's
  // agents read first should not contain the phrase at all.
  test("CLAUDE.md implies no registry credential anywhere", () => {
    for (const stale of ["NODE_AUTH_TOKEN", ".npmrc", "private registry", "GitHub Packages"]) {
      expect(claudeMd).not.toContain(stale);
    }
  });
});

// Issue #100. `progress.txt` was a 55KB append-only build log — dev notes from
// the initial build, never written for a reader, and carrying the maintainer's
// personal addresses. It sat at the repo root next to `PRD.md`, which reads as
// an invitation to treat it as documentation. Git history keeps it; the working
// tree should not, and neither should anything that points a reader at it.
describe("the retired build log", () => {
  const BUILD_LOG = "progress.txt";

  /** This file names it to assert its absence, so it cannot be its own failure. */
  const SELF = relative(repoRoot, import.meta.path);

  /** Asked of git: an untracked scratch file at the root is nobody's business. */
  const TRACKED = (() => {
    const result = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: repoRoot });
    return new TextDecoder().decode(result.stdout).split("\0").filter(Boolean);
  })();

  const BINARY = /\.(?:png|jpe?g|webp|gif|ico|svgz|woff2?|ttf|otf|pdf)$/i;

  test("git answers with the tracked set, so the scan below means something", () => {
    expect(TRACKED).toContain("CLAUDE.md");
    expect(TRACKED).toContain(SELF);
  });

  test("it is gone from the working tree", () => {
    expect(existsSync(join(repoRoot, BUILD_LOG))).toBe(false);
  });

  // The whole tree, not just the docs: `.dockerignore` listed it too, and a
  // build-context rule for a file that does not exist is the same dead pointer
  // a sentence is.
  test("no tracked file mentions it any more", () => {
    const mentions = TRACKED.filter((path) => path !== SELF && !BINARY.test(path)).filter((path) =>
      read(path).includes(BUILD_LOG),
    );
    expect(mentions).toEqual([]);
  });

  // Deleting the file is half of it: the line that described the pair has to
  // still describe the one that survives, rather than losing `PRD.md` with it.
  test("CLAUDE.md still tells a reader what PRD.md is", () => {
    const line = claudeMd.split("\n").find((row) => row.includes("`PRD.md`"));
    expect(line).toBeDefined();
    expect(line).toContain("product spec");
  });
});
