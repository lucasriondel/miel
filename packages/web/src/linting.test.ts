import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Issue #98. oxlint is the repo's linter, wired the way oxfmt already is: a
// script per package, orchestrated by turbo, with a single config at the root —
// and, for the first time here, a CI workflow that runs lint, format:check and
// typecheck on every pull request.
//
// The file sits next to formatting.test.ts and for the same reason: the
// exclusion it has to protect is this package's. `src/components/ui` and
// `src/lib/gousse` are copied in by `bunx shadcn@latest add @gousse/<item>`,
// which overwrites them from upstream, so a lint fix applied there is undone by
// the next re-add. That has to be a line in the config, not a habit.
const repoRoot = resolve(import.meta.dir, "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const rootManifest = JSON.parse(read("package.json")) as {
  scripts: Record<string, string>;
  packageManager: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const oxlintConfigSource = read(".oxlintrc.json");

/**
 * The config is JSONC — every rule turned off has to say why, right above
 * itself, and a comment is the only place that fits. Whole-line comments are
 * the only form used, so dropping them is enough to hand the rest to JSON.parse.
 */
const oxlintConfig = JSON.parse(
  oxlintConfigSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n"),
) as {
  plugins: string[];
  categories: Record<string, string>;
  rules?: Record<string, unknown>;
  ignorePatterns: string[];
};

const turbo = JSON.parse(read("turbo.json")) as {
  tasks: Record<string, unknown>;
  globalDependencies?: string[];
};

/** Read off the repo, so a package added later is covered without a change here. */
const PACKAGE_MANIFESTS = [...new Glob("packages/*/package.json").scanSync(repoRoot)];

const VENDORED_DIRS = ["packages/web/src/components/ui", "packages/web/src/lib/gousse"];

const oxlintBin = join(repoRoot, "node_modules/.bin/oxlint");

const runOxlint = (args: string[]) =>
  Bun.spawnSync([oxlintBin, "-c", ".oxlintrc.json", ...args], { cwd: repoRoot });

/** Every file the linter actually opens, as it sees them from the repo root. */
const LINTED_FILES = (() => {
  const result = runOxlint(["--debug=files", "packages"]);
  return new TextDecoder()
    .decode(result.stdout)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
})();

describe("the linter itself", () => {
  test("is a devDependency of the root package, so every workspace shares one version", () => {
    expect(rootManifest.devDependencies?.oxlint).toBeString();
  });

  test("is declared nowhere else, so no package can drift onto its own version", () => {
    const elsewhere = PACKAGE_MANIFESTS.filter((path) => {
      const pkg = JSON.parse(read(path)) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      return "oxlint" in { ...pkg.dependencies, ...pkg.devDependencies };
    });
    expect(elsewhere).toEqual([]);
  });

  test("is installed, so the scripts below have something to run", () => {
    expect(existsSync(oxlintBin)).toBe(true);
  });
});

describe("the enabled rules", () => {
  test.each(["correctness", "suspicious"])("the `%s` category is an error", (category) => {
    expect(oxlintConfig.categories[category]).toBe("error");
  });

  // Getting to zero by silencing a category would be getting to zero by not
  // looking. Individual rules can be turned off; a category cannot.
  test("no category is turned off", () => {
    expect(Object.values(oxlintConfig.categories)).not.toContain("off");
    expect(Object.values(oxlintConfig.categories)).not.toContain("allow");
  });

  test("the TypeScript plugin is on, so the whole repo is covered", () => {
    expect(oxlintConfig.plugins).toContain("typescript");
  });

  // React 19 across both UI packages: the hooks rules and the a11y rules are
  // the point of running a linter over this tree at all.
  test.each(["react", "react-hooks", "jsx-a11y"])("the `%s` plugin is on", (plugin) => {
    expect(oxlintConfig.plugins).toContain(plugin);
  });

  test("every rule turned off says why, on the line above it", () => {
    const lines = oxlintConfigSource.split("\n");
    const disabled = lines.filter((line) => /^\s*"[^"]+"\s*:\s*"off"\s*,?\s*$/.test(line));
    expect(disabled.length).toBeGreaterThan(0);
    for (const line of disabled) {
      const previous = lines[lines.indexOf(line) - 1]!;
      expect(previous.trim().startsWith("//")).toBe(true);
    }
  });
});

describe("what the linter is not pointed at", () => {
  test.each(VENDORED_DIRS)("%s is named in the config's ignore list", (dir) => {
    expect(oxlintConfig.ignorePatterns).toContain(`${dir}/**`);
  });

  // The list above says what was intended; this says what the linter does. A
  // pattern that silently matches nothing — a typo, a directory that moved —
  // passes the first check and fails here.
  test.each(VENDORED_DIRS)("%s holds files the linter would otherwise open", (dir) => {
    const sources = [...new Glob("**/*.{ts,tsx}").scanSync(join(repoRoot, dir))];
    expect(sources.length).toBeGreaterThan(0);
  });

  test("no vendored file is linted when the linter runs over the repo", () => {
    const inside = LINTED_FILES.filter((path) =>
      VENDORED_DIRS.some((dir) => path.startsWith(`${dir}/`)),
    );
    expect(inside).toEqual([]);
  });

  test("the router's generated route tree is ignored", () => {
    const generated = "packages/landing-page/src/routeTree.gen.ts";
    expect(existsSync(join(repoRoot, generated))).toBe(true);
    expect(oxlintConfig.ignorePatterns).toContain(generated);
    expect(LINTED_FILES).not.toContain(generated);
  });

  test("the app's own source is linted, so the ignore list has not swallowed it", () => {
    expect(LINTED_FILES).toContain("packages/web/src/App.tsx");
    expect(LINTED_FILES.length).toBeGreaterThan(300);
  });
});

describe("the per-package scripts", () => {
  test.each(PACKAGE_MANIFESTS)("%s lints with oxlint against the root config", (path) => {
    const { scripts } = JSON.parse(read(path)) as { scripts: Record<string, string> };
    expect(scripts.lint).toContain("oxlint");
    expect(scripts.lint).toContain("../../.oxlintrc.json");
  });

  test.each(PACKAGE_MANIFESTS)("%s has no placeholder lint script left", (path) => {
    const { scripts } = JSON.parse(read(path)) as { scripts: Record<string, string> };
    expect(scripts.lint).not.toContain("no lint configured");
  });
});

describe("the root entry point", () => {
  test("turbo defines the `lint` task", () => {
    expect(turbo.tasks.lint).toBeDefined();
  });

  // The config lives above every package, so turbo's per-package file hashing
  // cannot see it: without this, editing a rule replays yesterday's cached pass.
  test("the lint config is a global dependency, so editing it busts the cache", () => {
    expect(turbo.globalDependencies).toContain(".oxlintrc.json");
  });

  test("`bun run lint` fans the task out over turbo", () => {
    expect(rootManifest.scripts.lint).toBe("turbo run lint");
  });
});

describe("the repo as the linter finds it", () => {
  test("is clean", () => {
    const result = runOxlint(["packages"]);
    const output =
      new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
    // oxlint prints its "Found 0 warnings and 0 errors." summary only when it
    // believes it is writing to a terminal — turbo hands the suite a pty, a bare
    // shell does not — so the word "error" appears in a *clean* run on the very
    // machine CI uses. Match the count it reports, not the word.
    const reported = output.match(/Found \d+ warnings? and (\d+) errors?\./);
    expect(reported?.[1] ?? "0").toBe("0");
    expect(result.exitCode).toBe(0);
  });

  // A rule silenced at a single call site is the narrow form the config-level
  // "off" above is the blunt one — but only if it says what it is for.
  test("every inline disable carries a reason", () => {
    const withoutReason: string[] = [];
    for (const relative of LINTED_FILES) {
      const source = read(relative);
      for (const line of source.split("\n")) {
        // The directive itself — a comment that opens with it — rather than any
        // line that happens to mention the word, such as the ones just above.
        if (!/^\s*(\/\/|\{?\/\*)\s*oxlint-disable/.test(line)) continue;
        if (!line.includes(" -- ")) withoutReason.push(`${relative}: ${line.trim()}`);
      }
    }
    expect(withoutReason).toEqual([]);
  });
});

// The gate itself — that it runs, on what, and against which Postgres — is
// asserted in ci.test.ts, which grew out of these checks when #103 added the
// test job. What stays here is the one thing about it that is linting's: that
// `bun run lint` is a step.
describe("the CI gate", () => {
  test("runs the linter", () => {
    expect(read(".github/workflows/ci.yml")).toContain("bun run lint");
  });
});

describe("the documentation", () => {
  const claudeMd = read("CLAUDE.md");

  test("CLAUDE.md names the linter and the categories it enables", () => {
    expect(claudeMd).toContain("oxlint");
    expect(claudeMd).toContain("bun run lint");
    expect(claudeMd).toContain("correctness");
    expect(claudeMd).toContain("suspicious");
  });

  test("CLAUDE.md says the vendored gousse-ui source is exempt from linting too", () => {
    const paragraph = claudeMd
      .split("\n\n")
      .find((block) => block.includes("oxlint") && block.includes("gousse"));
    expect(paragraph).toBeDefined();
  });

  test("CLAUDE.md describes the CI gate", () => {
    const paragraph = claudeMd
      .split("\n\n")
      .find((block) => block.includes(".github/workflows") && block.includes("pull request"));
    expect(paragraph).toBeDefined();
  });
});
