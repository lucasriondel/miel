import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import * as claudeCodeTokenHooks from "./claudeCodeToken.hooks";
import * as providerCredentialHooks from "./providerCredential.hooks";

// #135. One hook owns a credential's lifecycle, and the point of "one" is that
// there is no second way in. The two option-factory modules kept a `use…`
// wrapper per verb — the ones the deleted tile family called — and every one of
// them is a way to write a credential without the ladder, the draft handling or
// the endpoint branch `useCredential` exists to hold. They are unused now, and
// this is the guard that keeps a caller from finding them again.
//
// Reads are not the same question. `useProviderCredentials` answers "which
// vendors have a key" for a model picker and `useProviderCredentialFor` answers
// the onboarding gate's; neither edits anything, so neither belongs behind the
// lifecycle hook.

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

const exportedHooks = (module: Record<string, unknown>): string[] =>
  Object.keys(module)
    .filter((name) => name.startsWith("use"))
    .toSorted();

describe("one owner per credential", () => {
  test("there are source files to check at all", () => {
    // A walk that silently matched nothing would pass every assertion below.
    expect(files.length).toBeGreaterThan(50);
  });

  test("`useCredential` is the only module that writes a credential", () => {
    const writers = [
      "setProviderCredentialMutationOptions",
      "deleteProviderCredentialMutationOptions",
      "setClaudeCodeTokenMutationOptions",
      "deleteClaudeCodeTokenMutationOptions",
    ];
    const allowed = new Set([
      join("api", "useCredential.ts"),
      // The modules the factories are declared in.
      join("api", "providerCredential.hooks.ts"),
      join("api", "claudeCodeToken.hooks.ts"),
    ]);
    const callers = files.filter(
      (f) => !allowed.has(f.path) && writers.some((name) => f.text.includes(name)),
    );
    expect(callers.map((f) => f.path)).toEqual([]);
  });

  test("the token module exports factories only, no hooks of its own", () => {
    expect(exportedHooks(claudeCodeTokenHooks)).toEqual([]);
  });

  test("the vendor-key module exports the two roster reads and nothing that writes", () => {
    expect(exportedHooks(providerCredentialHooks)).toEqual([
      "useProviderCredentialFor",
      "useProviderCredentials",
    ]);
  });
});
