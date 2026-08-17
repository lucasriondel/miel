import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Issue #97. oxfmt is the repo's one formatter, wired the way `lint` already is:
// a script per package, orchestrated by turbo, with a single config at the root.
//
// The file lives in this package because the exclusion it has to protect is
// this package's: `src/components/ui` and `src/lib/gousse` are copied in by
// `bunx shadcn@latest add @gousse/<item>`, which overwrites them in place from
// upstream. Reformatting them would make every re-add arrive as whitespace noise
// with the real change buried in it, so they are out of the formatter's reach —
// and that has to be a line in the config, not a habit of whoever runs it.
const repoRoot = resolve(import.meta.dir, "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const rootManifest = JSON.parse(read("package.json")) as {
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const oxfmtConfig = JSON.parse(read(".oxfmtrc.json")) as { ignorePatterns: string[] };

const turbo = JSON.parse(read("turbo.json")) as { tasks: Record<string, unknown> };

/** Read off the repo, so a package added later is covered without a change here. */
const PACKAGE_MANIFESTS = [...new Glob("packages/*/package.json").scanSync(repoRoot)];

/**
 * The directories the shadcn registry writes into, from `components.json`. Both
 * are vendored upstream source; the stylesheets under `src/styles/gousse` are
 * too, but CSS is outside what this slice formats.
 */
const VENDORED_DIRS = ["packages/web/src/components/ui", "packages/web/src/lib/gousse"];

const oxfmtBin = join(repoRoot, "node_modules/.bin/oxfmt");

/**
 * Every path under `packages/` the formatter would rewrite, as it sees them from
 * the repo root — so the ignore rules in the root config are the ones in force.
 * Asked once: this shells out, and every check below reads the same answer.
 */
const WOULD_REWRITE = (() => {
  const result = Bun.spawnSync([oxfmtBin, "--list-different", "packages"], { cwd: repoRoot });
  return new TextDecoder()
    .decode(result.stdout)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
})();

describe("the formatter itself", () => {
  test("is a devDependency of the root package, so every workspace shares one version", () => {
    expect(rootManifest.devDependencies?.oxfmt).toBeString();
  });

  test("is declared nowhere else, so no package can drift onto its own version", () => {
    const elsewhere = PACKAGE_MANIFESTS.filter((path) => {
      const pkg = JSON.parse(read(path)) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      return "oxfmt" in { ...pkg.dependencies, ...pkg.devDependencies };
    });
    expect(elsewhere).toEqual([]);
  });

  test("is installed, so the scripts below have something to run", () => {
    expect(existsSync(oxfmtBin)).toBe(true);
  });
});

describe("the vendored gousse-ui source", () => {
  test.each(VENDORED_DIRS)("%s is named in the config's ignore list", (dir) => {
    const relativeToWeb = dir.replace(/^packages\/web\//, "");
    const covers = oxfmtConfig.ignorePatterns.some(
      (pattern) => pattern.startsWith(dir) || pattern.includes(relativeToWeb),
    );
    expect(covers).toBe(true);
  });

  // The list above says what was intended; this says what the formatter does.
  // A pattern that silently matches nothing — a typo, a directory that moved —
  // passes the first check and fails here.
  test.each(VENDORED_DIRS)("%s holds files oxfmt would otherwise rewrite", (dir) => {
    const sources = [...new Glob("**/*.{ts,tsx}").scanSync(join(repoRoot, dir))];
    expect(sources.length).toBeGreaterThan(0);
  });

  test("is left alone when the formatter runs over the repo", () => {
    const inside = WOULD_REWRITE.filter((path) =>
      VENDORED_DIRS.some((dir) => path.startsWith(`${dir}/`)),
    );
    expect(inside).toEqual([]);
  });
});

/**
 * Generated files are excluded for the same reason as the vendored ones: their
 * writer, not the formatter, decides their shape, so formatting them turns the
 * next regeneration into a diff.
 */
describe("generated files", () => {
  test("the router's generated route tree is ignored", () => {
    const generated = "packages/landing-page/src/routeTree.gen.ts";
    expect(existsSync(join(repoRoot, generated))).toBe(true);
    expect(oxfmtConfig.ignorePatterns).toContain(generated);
    expect(WOULD_REWRITE).not.toContain(generated);
  });
});

describe("the per-package scripts", () => {
  test.each(PACKAGE_MANIFESTS)(
    "%s writes with `format` and verifies with `format:check`",
    (path) => {
      const { scripts } = JSON.parse(read(path)) as { scripts: Record<string, string> };
      expect(scripts.format).toContain("oxfmt");
      expect(scripts.format).not.toContain("--check");
      expect(scripts["format:check"]).toContain("oxfmt");
      expect(scripts["format:check"]).toContain("--check");
    },
  );

  // Manifests, the drizzle snapshots and the stylesheets are all things oxfmt
  // can format and something else already owns: `bun add` rewrites a manifest,
  // `drizzle-kit generate` rewrites a snapshot. This slice is the TS/TSX tree.
  test.each(PACKAGE_MANIFESTS)("%s scopes the formatter to TypeScript sources", (path) => {
    const { scripts } = JSON.parse(read(path)) as { scripts: Record<string, string> };
    for (const script of [scripts.format!, scripts["format:check"]!]) {
      expect(script).toContain("**/*.{ts,tsx}");
    }
  });
});

describe("the root entry points", () => {
  test.each(["format", "format:check"])("turbo defines the `%s` task", (task) => {
    expect(turbo.tasks[task]).toBeDefined();
  });

  // A write task with no declared outputs would be replayed from cache and
  // never touch the tree; the check is cheap enough not to be worth caching.
  test.each(["format", "format:check"])("the `%s` task is not cached", (task) => {
    expect((turbo.tasks[task] as { cache?: boolean }).cache).toBe(false);
  });

  test.each(["format", "format:check"])("`bun run %s` fans the task out over turbo", (task) => {
    expect(rootManifest.scripts[task]).toBe(`turbo run ${task}`);
  });
});

describe("the documentation", () => {
  const claudeMd = read("CLAUDE.md");

  test("CLAUDE.md names the formatter", () => {
    expect(claudeMd).toContain("oxfmt");
    expect(claudeMd).toContain("bun run format");
  });

  test("CLAUDE.md says the vendored gousse-ui source is exempt", () => {
    const paragraph = claudeMd
      .split("\n\n")
      .find((block) => block.includes("oxfmt") && block.includes("gousse"));
    expect(paragraph).toBeDefined();
  });
});
