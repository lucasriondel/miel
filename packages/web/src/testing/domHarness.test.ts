// The harness itself (#129). Everything else in this package can now render a
// component and click a button; what this file guards is that the ability
// arrives the same way for every suite — from a preload, not from a global some
// test file set up on its way past.
//
// That distinction is the whole point. The stubs this replaced were assignments
// to `globalThis.window`, and bun shares globals across test files: whichever
// suite ran last decided what `window` meant for the ones after it, which is
// why one suite had to delete the global before it could render at all.
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { APP_BASE_URL } from "@miel/core/appBasePath";

const packageRoot = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(packageRoot, path), "utf8");

const manifest = JSON.parse(read("package.json")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** The preload paths bun is told to load before any test file. */
const preloads = [...read("bunfig.toml").matchAll(/"([^"]+)"/g)].map((match) => match[1]!);

/** Every suite but this one, which names the things it is scanning for. */
const TEST_FILES = [...new Glob("src/**/*.test.{ts,tsx}").scanSync(packageRoot)].filter(
  (path) => !path.startsWith("src/testing/"),
);

describe("how the DOM arrives", () => {
  test("is registered as a preload, so no suite has to set one up", () => {
    expect(read("bunfig.toml")).toContain("[test]");
    expect(preloads).toContain("./src/testing/domHarness.ts");
    for (const preload of preloads) expect(existsSync(join(packageRoot, preload))).toBe(true);
  });

  test("is already there in a file that asks for nothing", () => {
    // This suite imports no harness of its own — the globals below are the
    // preload's, which is what every other suite relies on too.
    expect(typeof document).toBe("object");
    expect(document.body).toBeDefined();
    expect(typeof window).toBe("object");
  });

  test("puts the window on the app's own origin, prefix included", () => {
    // `apiFetch` resolves a path-only base against the origin, so a window
    // parked on about:blank would build URLs no browser ever sends.
    expect(window.location.origin).toBe("http://localhost:3000");
    expect(window.location.pathname).toBe(APP_BASE_URL);
  });

  test("ships as a devDependency — none of this reaches the bundle", () => {
    for (const name of ["happy-dom", "@happy-dom/global-registrator", "@testing-library/react"]) {
      expect(manifest.devDependencies?.[name]).toBeString();
      expect(manifest.dependencies?.[name]).toBeUndefined();
    }
  });
});

describe("what no test file has to do any more", () => {
  test("none of them builds a DOM global by hand", () => {
    const offenders = TEST_FILES.filter((path) =>
      /(globalThis|global)\s*(as[^=]*)?\)?\.(window|document|navigator|location)\s*=/.test(
        read(path),
      ),
    );

    expect(TEST_FILES.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  test("and none of them registers happy-dom itself", () => {
    const offenders = TEST_FILES.filter((path) => read(path).includes("GlobalRegistrator"));

    expect(offenders).toEqual([]);
  });
});

describe("between tests", () => {
  test("a render leaves its markup in the body", () => {
    render(createElement("section", null, "mounted"));

    expect(document.body.querySelector("section")).not.toBeNull();
  });

  test("and the next test gets an empty one", () => {
    // Testing Library's `cleanup`, run from the preload: without it every
    // `getByRole` in the second test of a suite is ambiguous.
    expect(document.body.querySelector("section")).toBeNull();
  });
});
