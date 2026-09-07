import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// #130. Turning a failed request into a sentence was done in eleven places with
// two behaviours: eight components carried an identical inline `describeError`,
// and two shared modules competed — `describeApiError` returned the machine code
// the envelope's `error` field names, `apiErrorMessage` returns the `message`
// beside it. Which one the user got depended on which module the feature
// happened to import, so a Settings failure read `invalid_provider_credential`
// while a reply failure read a sentence.
//
// One describer now, and it is `apiErrorMessage`. This test is the guard: a new
// local copy, or a revival of the module that dropped the message, fails here
// rather than the next time someone reads their own error.

const src = join(import.meta.dir, "..");

const sourceFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Vendored gousse-ui source is overwritten by the registry re-add, so
        // it is exempt here for the reason it is exempt from lint and format.
        if (entry.name === "ui" && dir.endsWith(join("src", "components"))) continue;
        if (entry.name === "gousse") continue;
        walk(path);
        continue;
      }
      if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
    }
  };
  walk(src);
  return out;
};

const files = sourceFiles().map((path) => ({
  path: relative(src, path),
  text: readFileSync(path, "utf8"),
}));

describe("one error describer", () => {
  test("there are source files to check at all", () => {
    // A walk that silently matched nothing would pass every assertion below.
    expect(files.length).toBeGreaterThan(50);
  });

  test("the describer is `apiErrorMessage`, and it lives in the api layer", () => {
    const describer = files.find((f) => f.path === join("api", "apiErrorMessage.ts"));
    expect(describer).toBeDefined();
    expect(describer?.text).toMatch(/export function apiErrorMessage/);
  });

  test("no feature keeps a private copy of it", () => {
    const copies = files.filter((f) => /(?:function|const)\s+describe(?:Api)?Error\b/.test(f.text));
    expect(copies.map((f) => f.path)).toEqual([]);
  });

  test("the module that returned the machine code is gone, name and all", () => {
    const survivors = files.filter((f) => f.text.includes("describeApiError"));
    expect(survivors.map((f) => f.path)).toEqual([]);
  });

  test("nothing reaches for `.message` on an error to show a user", () => {
    // `ApiError.message` is the envelope's `error` field — a machine code.
    // Reading it directly is the bug this issue is about; `apiErrorMessage`
    // prefers the `message` beside it and falls back to the code.
    const allowed = new Set([
      // The one describer, which is where the fallback belongs.
      join("api", "apiErrorMessage.ts"),
      // Not a response: `buildMergePreview` describes an error its own algebra
      // threw, computed locally without a request.
      join("features", "filters", "mergePreview.ts"),
    ]);
    const raw = files.filter(
      (f) => !allowed.has(f.path) && /instanceof Error\s*\?[\s\S]{0,40}\.message/.test(f.text),
    );
    expect(raw.map((f) => f.path)).toEqual([]);
  });
});
