// Suites that run in a process of their own, and the one way this can go wrong.
//
// `mock.module` is process-global and `mock.restore()` does not undo it, so two
// kinds of suite cannot sit in the `bun test ./src` sweep: one that must reach a
// module the others fake (`stores/postgres.dbtest.ts`, which needs the real
// `db/client`), and one that fakes a module the others must reach
// (`google/gmailAdapter.proctest.ts` and `google/GoogleAuth.proctest.ts`). Both
// are named so bun's `*.test.ts` glob does not collect them, and
// `scripts/test-with-db.sh` runs each by path afterwards.
//
// That naming is what makes the failure mode: a file the sweep does not collect
// and the script does not name runs *nowhere*, and nothing says so — it does not
// fail, it disappears, which is worse than the pollution it was moved out to
// avoid. So the two lists are checked against each other here.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";

const ROOT = new URL("..", import.meta.url).pathname;
const SCRIPT = "scripts/test-with-db.sh";

/** Every suite deliberately kept out of the sweep, as a path from the package root. */
const isolatedSuites = (): string[] =>
  [...new Glob("src/**/*.{dbtest,proctest}.ts").scanSync(ROOT)]
    .map((p) => p.replaceAll("\\", "/"))
    .toSorted();

const script = () => readFileSync(`${ROOT}${SCRIPT}`, "utf8");

describe("suites that run in their own process", () => {
  test("there are some — the guard is not passing by matching nothing", () => {
    expect(isolatedSuites().length).toBeGreaterThan(0);
  });

  test("bun's own glob cannot collect them, or they would be in the sweep too", () => {
    for (const suite of isolatedSuites()) {
      expect(suite.endsWith(".test.ts")).toBe(false);
    }
  });

  test(`each one is named by ${SCRIPT}, so none of them runs nowhere`, () => {
    const text = script();
    for (const suite of isolatedSuites()) {
      expect(text).toContain(`./${suite}`);
    }
  });

  test("the script names no isolated suite that has been moved or deleted", () => {
    const present = new Set(isolatedSuites());
    const named = [...script().matchAll(/\.\/(src\/\S*?\.(?:dbtest|proctest)\.ts)/g)].map(
      (m) => m[1]!,
    );
    expect(named.length).toBeGreaterThan(0);
    for (const suite of named) {
      expect(present.has(suite)).toBe(true);
    }
  });
});
