import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import viteConfig from "../../vite.config";

/**
 * The two package-level promises that nothing else can check: the dev server
 * owns port 5200 from the shared registry and fails loudly on a clash, and the
 * package installs for anyone who clones the repo — no authenticated registry.
 */
const packageRoot = resolve(import.meta.dirname, "../..");

const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/**
 * Scopes that resolve from a registry demanding a credential. The root `.npmrc`
 * that pointed `@lucasriondel/*` at GitHub Packages is gone (#74) and nothing in
 * the repo depends on that scope any more — see web's `publicInstall.test.ts`,
 * which guards that repo-wide. This list stays as the local rule: whatever the
 * app takes on, this package installs for a cloner with no token.
 */
const PRIVATE_SCOPES = ["@lucasriondel/"];

const DEV_PORT = 5200;

describe("dev server port", () => {
  test("is pinned in the vite config, so any way of starting it uses 5200", () => {
    expect(viteConfig.server?.port).toBe(DEV_PORT);
  });

  test("is strict, so a clash fails to start instead of drifting to a free port", () => {
    expect(viteConfig.server?.strictPort).toBe(true);
  });

  test("is the same port the dev script asks for", () => {
    expect(packageJson.scripts.dev).toContain(`--port ${DEV_PORT}`);
    expect(packageJson.scripts.dev).toContain("--strictPort");
  });

  test("leaves the preview server unpinned, since the prerenderer boots one at build time", () => {
    expect(viteConfig.preview?.strictPort).toBeUndefined();
  });
});

describe("dependencies", () => {
  test("include nothing from a registry that needs authentication", () => {
    const names = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ];
    const gated = names.filter((name) => PRIVATE_SCOPES.some((scope) => name.startsWith(scope)));
    expect(gated).toEqual([]);
  });

  /**
   * @miel/core is the one workspace dependency, and it is deliberate: the
   * permission table derives its rows from core's canonical scope list, and the
   * Anthropic disclosure derives its figures from the constants the services
   * apply, so neither can drift. It costs nothing to a cloner — the package is
   * in the same repository. Any other workspace dependency would be scope creep
   * and is still refused here.
   */
  test("depend on no workspace package other than @miel/core", () => {
    const names = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ];
    expect(names.filter((name) => name.startsWith("@miel/"))).toEqual(["@miel/core"]);
  });

  test("reach core only through leaf subpaths, so no db or env code is pulled in", () => {
    const sources = [...new Glob("src/**/*.{ts,tsx}").scanSync(packageRoot)];
    const imports = sources.flatMap((file) =>
      [...readFileSync(join(packageRoot, file), "utf8").matchAll(/from\s+"(@miel\/[^"]+)"/g)].map(
        (match) => match[1]!,
      ),
    );
    expect(imports.length).toBeGreaterThan(0);
    for (const specifier of imports) {
      expect(specifier).not.toBe("@miel/core");
    }
  });
});

describe("build orchestration", () => {
  test("exposes the task names turbo runs at the repo root", () => {
    for (const task of ["build", "test", "typecheck", "lint"]) {
      expect(packageJson.scripts[task]).toBeString();
    }
  });

  /**
   * The page reads core's TypeScript source through the exports map, never its
   * emitted `dist`, so nothing here needs core compiled first. Cutting turbo's
   * default `^build` edge keeps the public page buildable — in CI and in the web
   * container's build stage — even while another package fails to compile.
   */
  test("does not wait on another package's build, since it consumes core's source", () => {
    const turbo = JSON.parse(readFileSync(resolve(packageRoot, "../..", "turbo.json"), "utf8")) as {
      tasks: Record<string, { dependsOn?: string[] }>;
    };
    for (const task of ["build", "test", "typecheck"]) {
      expect(turbo.tasks[`@miel/landing-page#${task}`]?.dependsOn).toEqual([]);
    }
  });

  /**
   * The prerendered-output check reads files the build writes, so it runs at the
   * end of the build — after staticize, which is what produces `dist/public` —
   * rather than in `bun test`, which has to stay runnable without a build.
   */
  test("verifies the prerendered output at the end of the build, after staticize", () => {
    const build = packageJson.scripts.build ?? "";
    expect(build).toContain("scripts/verify-prerendered.ts");
    expect(build.indexOf("verify-prerendered")).toBeGreaterThan(build.indexOf("staticize"));
  });

  test("keeps that check out of the plain test run, which must not need a build", () => {
    expect(packageJson.scripts.test).not.toContain("verify-prerendered");
    expect(packageJson.scripts.test).not.toContain("vite build");
  });

  test("is a workspace member of the root package", () => {
    const root = JSON.parse(
      readFileSync(resolve(packageRoot, "../..", "package.json"), "utf8"),
    ) as { workspaces: string[] };
    expect(root.workspaces).toContain("packages/*");
  });
});
