import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

// Issue #121. Forty-two turbo cache files — a third of a megabyte of tarballs
// and manifests — were tracked, because `.gitignore` covered `.turbo` and that
// pattern matches no path called `.turbo-cache`. Nothing failed: a generated
// directory that is not ignored simply arrives in whichever commit is made next
// to it, and it did, twice.
//
// So the guard is not "the file says `.turbo-cache`" — a rule can be written and
// still not match, which is the entire bug. It asks git the two questions that
// matter: is anything generated tracked, and would a fresh write be ignored.
//
// It sits beside publicRepoHygiene.test.ts (#99), which asks what identity the
// tree carries, and publicInstall.test.ts (#74), which asks what a clone needs.
// This one asks what the tree carries that it never wrote by hand.
const repoRoot = resolve(import.meta.dir, "../../..");

const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: repoRoot });

/** Exit 0 from `git check-ignore` means some rule matches the path. */
const isIgnored = (path: string) => git("check-ignore", "-q", path).exitCode === 0;

const TRACKED = git("ls-files", "-z")
  .stdout.toString()
  .split("\0")
  .filter((path) => path.length > 0);

/**
 * Directories a tool writes into, so nothing under one is source: bun's install
 * tree, the build outputs turbo.json declares (`dist/**`, `.next/**`), and the
 * two turbo keeps its cache in — `.turbo` for task logs and hashes, and the
 * `.turbo-cache` this issue is about, which is where `--cache-dir` points here.
 */
const GENERATED = ["node_modules", "dist", ".next", ".turbo", ".turbo-cache"];

describe("generated directories", () => {
  test("the repository tracks something, so the checks below have a subject", () => {
    expect(TRACKED.length).toBeGreaterThan(0);
  });

  test("no tracked file lives under one", () => {
    const generated = TRACKED.filter((path) =>
      path.split("/").some((segment) => GENERATED.includes(segment)),
    );
    expect(generated).toEqual([]);
  });

  // Probe paths, not real ones: `git check-ignore` consults the index and calls
  // a tracked file un-ignored, which would make this pass only by accident of
  // what happens to exist. A path that exists in neither place is answered by
  // the ignore rules alone.
  test.each(GENERATED)("a fresh write under %s is ignored, at the root", (directory) => {
    expect(isIgnored(`${directory}/probe-121`)).toBe(true);
  });

  test.each(GENERATED)("a fresh write under %s is ignored, inside a package", (directory) => {
    expect(isIgnored(`packages/web/${directory}/probe-121`)).toBe(true);
  });
});
