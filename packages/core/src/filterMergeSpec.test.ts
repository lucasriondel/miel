// The merge algebra as a leaf module: importable by the web app to preview a
// merge before committing it, so what the confirmation step shows is the very
// function the server will run — not a second implementation of it.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  FilterMergeRejection,
  buildMergedFilterSpec,
  criteriaToQueryTerm,
} from "./filterMergeSpec";

/**
 * The package root, found by walking up rather than assumed to be the parent of
 * this file: `tsc` emits this suite into `dist/` too, and the source it reads
 * only ever lives under `src/`.
 */
function packageRoot(): string {
  let dir = import.meta.dir;
  while (!existsSync(resolve(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("no package.json above " + import.meta.dir);
    dir = parent;
  }
  return dir;
}

describe("the leaf module's contract", () => {
  test("it imports nothing, so a browser bundle pays for no core dependency", () => {
    // `services/filterMerge.ts` reaches `../errors`, which reaches `effect`.
    // The preview needs the algebra, not the tagged-error taxonomy or the
    // runtime behind it, so the algebra lives where nothing pulls those in.
    const source = readFileSync(resolve(packageRoot(), "src/filterMergeSpec.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });

  test("package.json exposes it as its own subpath export", () => {
    const manifest = JSON.parse(readFileSync(resolve(packageRoot(), "package.json"), "utf8")) as {
      exports: Record<string, string>;
    };
    expect(manifest.exports["./filterMergeSpec"]).toBe("./src/filterMergeSpec.ts");
  });
});

describe("FilterMergeRejection", () => {
  test("carries the reason and the offending ids, and is a real Error", () => {
    let caught: unknown;
    try {
      buildMergedFilterSpec([{ gmailFilterId: "f1", criteria: {}, action: {} }]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FilterMergeRejection);
    expect(caught).toBeInstanceOf(Error);
    const rejection = caught as FilterMergeRejection;
    expect(rejection.reason).toBe("too_few");
    expect(rejection.message).toMatch(/at least 2/i);
    expect(rejection.gmailFilterIds).toEqual(["f1"]);
  });

  test("an unmergeable pair names why, so a preview can say it out loud", () => {
    const sources = [
      { gmailFilterId: "f1", criteria: { from: "a@x.com" }, action: { addLabelIds: ["L1"] } },
      { gmailFilterId: "f2", criteria: { from: "b@x.com" }, action: { removeLabelIds: ["L1"] } },
    ];
    expect(() => buildMergedFilterSpec(sources)).toThrow(FilterMergeRejection);
    expect(() => buildMergedFilterSpec(sources)).toThrow(/L1/);
  });
});

describe("the algebra itself", () => {
  test("OR-s the sources' terms and unions their labels", () => {
    expect(
      buildMergedFilterSpec([
        { gmailFilterId: "f1", criteria: { from: "a@x.com" }, action: { addLabelIds: ["L1"] } },
        {
          gmailFilterId: "f2",
          criteria: { subject: "monthly report" },
          action: { addLabelIds: ["L2"], removeLabelIds: ["INBOX"] },
        },
      ]),
    ).toEqual({
      query: "{from:a@x.com OR subject:(monthly report)}",
      addLabelIds: ["L1", "L2"],
      removeLabelIds: ["INBOX"],
    });
  });

  test("criteriaToQueryTerm is exported for term-level rendering", () => {
    expect(criteriaToQueryTerm({ from: "a@x.com" })).toBe("from:a@x.com");
  });
});
