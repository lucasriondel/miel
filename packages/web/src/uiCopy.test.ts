import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PROVIDERS, PROVIDER_MODELS } from "@miel/core/providerModels";

// Issue #93. The web UI is the product surface, and it named its vendor in
// toasts, labels and placeholders — "Claude Code is triaging your mails…".
// The copy now says "AI"; what the app *runs* is unchanged, so the provider
// value, the model ids, the env var and the `claude setup-token` line the
// settings card prints all stay literal.
//
// This scans source rather than restating the strings: the failure mode is a
// new string added later, not the ones already fixed. Comments are stripped
// first — they document the real implementation and are out of scope.
const packageRoot = resolve(import.meta.dir, "..");

const sourceFiles = [...new Glob("src/**/*.{ts,tsx}").scanSync({ cwd: packageRoot })]
  .filter((path) => !path.includes(".test."))
  // Vendored gousse registry copies (`components/ui`, `lib/gousse`) are not
  // ours to reword — a re-`add` would overwrite the edit.
  .filter((path) => !path.startsWith("src/components/ui/"))
  .filter((path) => !path.startsWith("src/lib/gousse/"))
  .toSorted();

/** Blanks comments while keeping every line where it was, for the report. */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => (line.trim().startsWith("//") ? "" : line))
    .join("\n");

/** Every line of copy in a file, comments blanked out. */
const copyLines = (path: string) =>
  stripComments(readFileSync(join(packageRoot, path), "utf8"))
    .split("\n")
    .map((text, i) => ({ line: i + 1, text }));

// Names of things, not words shown to anyone: model ids and the `claude-code`
// provider value, camelCase/PascalCase identifiers, API error codes and paths,
// and the one CLI command the token card tells you to run.
const NOT_COPY = [
  /claude-[a-z0-9.-]+/gi,
  /\b(?:[a-z][A-Za-z0-9]*Claude|Claude[A-Za-z0-9]+)\b/g,
  /claude_[a-z_]+/gi,
  /\/auth\/claude\b/gi,
  /claude setup-token/g,
];

const vendorMentions = (path: string) => {
  let text = stripComments(readFileSync(join(packageRoot, path), "utf8"));
  for (const pattern of NOT_COPY) text = text.replace(pattern, "");
  return text
    .split("\n")
    .map((line, i) => ({ line: i + 1, text: line }))
    .filter(({ text: line }) => /\bclaude\b/i.test(line))
    .map(({ line, text: t }) => `${path}:${line}: ${t.trim()}`);
};

/** Advice to run the CLI to add a mailbox, wherever it is still written. */
const cliAccountAdvice = (path: string) =>
  copyLines(path)
    .filter(({ text }) => /miel accounts|accounts sync/.test(text))
    .map(({ line, text }) => `${path}:${line}: ${text.trim()}`);

describe("user-facing copy names no vendor (#93)", () => {
  test("scans the source it is meant to scan", () => {
    expect(sourceFiles.length).toBeGreaterThan(50);
    expect(sourceFiles).toContain("src/api/syncSocket.ts");
    expect(sourceFiles).toContain("src/pages/SettingsPage.tsx");
  });

  test("no string in packages/web/src says Claude or Claude Code", () => {
    expect(sourceFiles.flatMap(vendorMentions)).toEqual([]);
  });

  // The other half of the issue: the copy changed, the wiring did not. The
  // provider values and model ids moved into core's catalogue in #105, so this
  // reads them there rather than in the row that renders them.
  test("keeps the provider value and the model ids literal", () => {
    expect(PROVIDERS).toContain("claude-code");
    expect(PROVIDER_MODELS["claude-code"].map((m) => m.id)).toContain("claude-haiku-4-5");
  });

  // Where a token is actually pasted is rendered and asserted in
  // `CredentialsCard.test.tsx` (#134's standard, on #135's tiles). What is left
  // here is the copy table those tiles read from, which since #135 is one table
  // rather than a wrapper per kind of credential. It names no env var, because
  // there is no longer one to name (#109) — what it must keep is the command
  // that produces the token.
  test("the credential copy names the command, not an env var", () => {
    const copy = readFileSync(join(packageRoot, "src/features/settings/credentialCopy.ts"), "utf8");

    expect(copy).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(copy).toContain("claude setup-token");
  });
});

// The sweep that used to be the one repo-wide check in `zeroAccountEmptyStates`.
// That suite renders now (#134), so it can only speak for the four surfaces it
// mounts — and the failure mode here is a *new* surface written later, which no
// render reaches because it does not exist yet. It is the same kind of check as
// the vendor sweep above, so it lives beside it.
describe("user-facing copy carries no stale CLI advice", () => {
  test("nothing tells the user to add an account from the CLI", () => {
    // Accounts are connected through in-app Google OAuth; `miel accounts …` has
    // not been the way to add one since that flow landed.
    expect(sourceFiles.flatMap(cliAccountAdvice)).toEqual([]);
  });
});
