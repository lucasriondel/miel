import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

// Issue #71 moved the Base-UI-free half of gousse-ui from the npm package to
// vendored registry source; #72 finished the job with the two primitives that
// need Base UI; #73 cut the three stylesheets over too. Nothing in this package
// reaches for the npm package any more — not a symbol, not a sheet — so "did
// the migration land" is a question about what, if anything, still names it.
const srcRoot = resolve(import.meta.dir, "..");

/** Every symbol vendored so far, plus `cn` (vendored back in #70). */
const MIGRATED_SYMBOLS = new Set([
  "cn",
  "Avatar",
  "Badge",
  "badgeClasses",
  "Button",
  "Checkbox",
  "Empty",
  "Input",
  "RadioGroup",
  "RadioGroupItem",
  "RainbowGlow",
  "Select",
  "Sheen",
  "Spinner",
  "Switch",
  "Textarea",
  // #72 — the Base UI half.
  "Separator",
  "DropdownMenu",
  "DropdownMenuContent",
  "DropdownMenuGroup",
  "DropdownMenuItem",
  "DropdownMenuLabel",
  "DropdownMenuSeparator",
  "DropdownMenuSub",
  "DropdownMenuSubContent",
  "DropdownMenuSubTrigger",
  "DropdownMenuTrigger",
]);

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if ([".ts", ".tsx"].includes(extname(entry.name))) yield path;
  }
}

const STATEMENT = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"@lucasriondel\/gousse-ui"/g;

/** file (relative to src/) → named bindings it pulls out of the npm package. */
const packageImports = new Map<string, string[]>();
for (const path of sourceFiles(srcRoot)) {
  if (path === import.meta.path) continue; // this file names the symbols in prose
  const names = [...(await Bun.file(path).text()).matchAll(STATEMENT)].flatMap(([, inner]) =>
    inner
      .split(",")
      .map(
        (n) =>
          n
            .trim()
            .replace(/^type\s+/, "")
            .split(/\s+as\s+/)[0]!,
      )
      .filter(Boolean),
  );
  if (names.length) packageImports.set(path.slice(srcRoot.length + 1), names);
}

describe("what still comes from the npm package", () => {
  test("nothing this slice vendored", () => {
    const offenders = Object.fromEntries(
      [...packageImports]
        .map(([file, names]) => [file, names.filter((n) => MIGRATED_SYMBOLS.has(n))] as const)
        .filter(([, names]) => names.length),
    );
    expect(offenders).toEqual({});
  });

  // With #72 in, no *symbol* comes from the package at all — every primitive
  // the app renders is vendored source.
  test("no symbols at all", () => {
    expect(Object.fromEntries(packageImports)).toEqual({});
  });

  // …and since #73, not the stylesheets either: `src/index.css` imports the
  // vendored `src/styles/gousse/*.css`. See gousseStylesheets.test.ts, which
  // compiles the result. #74 then dropped the dependency itself — see
  // publicInstall.test.ts, which is what now keeps it out of the manifest.
  test("and not the stylesheets", async () => {
    const css = await Bun.file(resolve(srcRoot, "index.css")).text();
    expect(css).not.toContain("@lucasriondel/gousse-ui");
  });
});

describe("the vendored Avatar", () => {
  // The live bug this slice fixes: without referrerPolicy Chrome sends a
  // Referer that lh3.googleusercontent.com 403s, so every Google profile
  // picture renders broken. The published package never got the fix.
  test("asks the browser not to send a Referer to Google's avatar CDN", async () => {
    const source = await Bun.file(resolve(srcRoot, "components/ui/avatar.tsx")).text();
    expect(source).toContain('referrerPolicy="no-referrer"');
  });
});
