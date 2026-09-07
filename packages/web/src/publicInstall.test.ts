import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Issue #74. `@lucasriondel/gousse-ui` came from GitHub Packages, which needs a
// token even for a public package, so one dependency of *this* package made the
// whole repo un-installable without a credential: a root `.npmrc`, a
// `NODE_AUTH_TOKEN` in `.env.example`, and a build argument on two images that
// run a workspace-root install. #71–#73 vendored everything the app read from
// the package; this file is the guard that the plumbing stayed gone.
//
// It lives here because this package is the one that dragged the requirement
// in, and it reads across the repo because that is how far the requirement got.
const repoRoot = resolve(import.meta.dir, "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

/** Scopes that resolve from a registry demanding authentication. */
const GATED_SCOPES = ["@lucasriondel"];

/** Every image built from this repo. The landing one never had the plumbing. */
const DOCKERFILES = [
  "packages/web/Dockerfile",
  "packages/api/Dockerfile",
  "packages/landing-page/Dockerfile",
];

/** Read off the repo, so a package added later is covered without a change. */
const MANIFESTS = ["package.json", ...new Glob("packages/*/package.json").scanSync(repoRoot)];

describe("what a clone needs to install", () => {
  test("no manifest in the repo declares a dependency from a gated scope", () => {
    const declared = MANIFESTS.flatMap((path) => {
      const pkg = JSON.parse(read(path)) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    });
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((name) => GATED_SCOPES.some((scope) => name.startsWith(scope)))).toEqual(
      [],
    );
  });

  // The manifest and the lockfile can disagree: dropping the dependency without
  // reinstalling leaves the tarball URL pinned, and `--frozen-lockfile` — what
  // both images run — installs from the lockfile.
  test("the lockfile pins nothing to an authenticated registry", () => {
    const lockfile = read("bun.lock");
    expect(lockfile).not.toContain("npm.pkg.github.com");
    for (const scope of GATED_SCOPES) expect(lockfile).not.toContain(scope);
  });

  test("no root .npmrc points a scope at one", () => {
    expect(existsSync(join(repoRoot, ".npmrc"))).toBe(false);
  });
});

describe("the images", () => {
  // The whole file, comments included: an `ARG` and a comment telling the
  // deployer to add a Dokploy build argument are equally live instructions, and
  // the second outlives the first in a dashboard nobody re-reads.
  test.each(DOCKERFILES)("%s asks for no registry credential", (path) => {
    const dockerfile = read(path);
    expect(dockerfile).not.toContain("NODE_AUTH_TOKEN");
    expect(dockerfile).not.toContain(".npmrc");
    for (const scope of GATED_SCOPES) expect(dockerfile).not.toContain(scope);
  });

  // The API image threaded the token through the install line itself, then
  // deleted the `.npmrc` it had copied in. Each image still runs the install it
  // always ran — just a plain one, with nothing in front of it.
  test.each(DOCKERFILES)("%s still installs from the frozen lockfile", (path) => {
    const install = read(path)
      .split("\n")
      .find((line) => line.includes("bun install"));
    expect(install).toBeDefined();
    expect(install).toContain("--frozen-lockfile");
    expect(install).toStartWith("RUN bun install");
  });

  /**
   * `--frozen-lockfile` compares the lockfile against *every* workspace member's
   * manifest and refuses a tree where one is missing — "lockfile had changes,
   * but lockfile is frozen", with nothing naming the absent package. The landing
   * image asserts this for itself; the app's two images copy their manifests by
   * hand too, and a package added to the workspace and forgotten in one of them
   * breaks that image's install. So the list is read off the repository rather
   * than restated here.
   */
  test.each(DOCKERFILES)("%s copies every workspace manifest before installing", (path) => {
    const beforeInstall = read(path).split(/^RUN .*bun install/m)[0]!;
    const copied = [...beforeInstall.matchAll(/^COPY\s+(packages\/\S+package\.json)/gm)].map(
      (match) => match[1]!,
    );
    expect(copied.toSorted()).toEqual(MANIFESTS.filter((m) => m !== "package.json").toSorted());
  });
});

describe("the documentation", () => {
  // Both told the reader to obtain a PAT: `.env.example` as a key to fill in,
  // DEPLOY.md as a build argument to paste into Dokploy. Neither instruction has
  // anything to act on now, and a stale one is how a revoked credential gets
  // recreated.
  test.each([".env.example", "DEPLOY.md"])("%s asks for no registry token", (path) => {
    const doc = read(path);
    expect(doc).not.toContain("NODE_AUTH_TOKEN");
    expect(doc).not.toContain(".npmrc");
  });

  test("the environment sample names no gated package", () => {
    for (const scope of GATED_SCOPES) expect(read(".env.example")).not.toContain(scope);
  });
});
