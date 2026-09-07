// One classification of "the AI provider cannot run", owned by the taxonomy
// (#126).
//
// Five places used to hardcode the same two-tag set — the two sync catches, the
// sync-all loop, the API error middleware and the sync WebSocket handler — and
// none of them had grown the third tag `ProviderNotRunnableError` (#125). So a
// keyless hosted vendor burned every batch as a non-fatal failure while the
// identical condition for claude-code stopped the run with a toast.
//
// What this suite pins is the shape that makes that impossible to repeat: the
// union is the source of truth, the tag set is derived from it, the predicate
// reads a `_tag` (so it works on an error that crossed a package boundary), and
// no source file outside this module names the tags as literals.
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import {
  ClaudeAuthError,
  ClaudeTokenMissingError,
  GmailApiError,
  HostedApiError,
  isProviderUnavailable,
  PROVIDER_UNAVAILABLE_TAGS,
  ProviderNotRunnableError,
  ShellError,
} from "./errors";

const notRunnable = () =>
  new ProviderNotRunnableError({
    task: "triage",
    provider: "anthropic",
    reason: "missing_provider_credential",
    phase: "run",
  });

describe("isProviderUnavailable", () => {
  test("holds for every member of the union", () => {
    expect(isProviderUnavailable(new ClaudeTokenMissingError())).toBe(true);
    expect(isProviderUnavailable(new ClaudeAuthError({ detail: "invalid token" }))).toBe(true);
    // The one the five copies were missing: a hosted vendor with no stored key,
    // refused before a socket is opened.
    expect(isProviderUnavailable(notRunnable())).toBe(true);
  });

  test("does not hold for a vendor that answered and failed", () => {
    // The distinction #125 drew: `HostedApiError` means the call happened and
    // the vendor rejected it. That is not "this install cannot do the work", so
    // it must not stop a sync run or claim the AI is unconfigured.
    expect(isProviderUnavailable(new HostedApiError({ detail: "429 rate limited" }))).toBe(false);
  });

  test("does not hold for the rest of the taxonomy, or for untagged values", () => {
    expect(isProviderUnavailable(new GmailApiError({ op: "list", cause: "boom" }))).toBe(false);
    expect(
      isProviderUnavailable(
        new ShellError({ cmd: ["claude"], exitCode: 1, stderr: "", stdout: "", message: "x" }),
      ),
    ).toBe(false);
    expect(isProviderUnavailable(new Error("gmail search failed"))).toBe(false);
    expect(isProviderUnavailable(null)).toBe(false);
    expect(isProviderUnavailable(undefined)).toBe(false);
    expect(isProviderUnavailable("ClaudeAuthError")).toBe(false);
    expect(isProviderUnavailable({})).toBe(false);
  });

  test("classifies by tag, so an error that crossed a boundary still counts", () => {
    // The API middleware and the WebSocket handler catch `unknown` at a promise
    // boundary, and both already read `_tag` rather than trusting `instanceof`
    // across module realms. The predicate has to answer for them too.
    expect(isProviderUnavailable({ _tag: "ClaudeTokenMissingError" })).toBe(true);
    expect(isProviderUnavailable({ _tag: "ProviderNotRunnableError", phase: "run" })).toBe(true);
    expect(isProviderUnavailable({ _tag: "GmailAuthError" })).toBe(false);
  });
});

describe("the shared tag set", () => {
  test("is exactly the union's tags", () => {
    expect([...PROVIDER_UNAVAILABLE_TAGS].toSorted()).toEqual([
      "ClaudeAuthError",
      "ClaudeTokenMissingError",
      "ProviderNotRunnableError",
    ]);
  });

  test("is derived from the union, so a fourth tag is one edit", () => {
    // The set is built from a record keyed by `ProviderUnavailableError["_tag"]`:
    // adding a member to the union without listing it there does not compile,
    // and listing it there is all that is needed — every consumer reads this
    // set. That is the type structure the acceptance criterion asks for; this
    // test guards the runtime half, that nothing else can be in it.
    for (const tag of PROVIDER_UNAVAILABLE_TAGS) {
      expect(isProviderUnavailable({ _tag: tag })).toBe(true);
    }
  });
});

describe("the two-tag literal set", () => {
  // The bug was copies, not the classification: each of the five sites spelled
  // the tags out and only one of them was ever updated. A tag named as a string
  // outside this module is that copy coming back.
  test("appears in no source file outside the taxonomy", () => {
    const repoRoot = join(import.meta.dir, "../../..");
    const offenders: string[] = [];

    for (const pattern of ["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"]) {
      for (const file of new Glob(pattern).scanSync({ cwd: repoRoot, absolute: true })) {
        const rel = relative(repoRoot, file);
        // Tests name tags on purpose (they assert on them), and the taxonomy is
        // where the literals belong.
        if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
        if (rel === join("packages", "core", "src", "errors.ts")) continue;

        const source = readFileSync(file, "utf8");
        for (const tag of PROVIDER_UNAVAILABLE_TAGS) {
          if (source.includes(`"${tag}"`) || source.includes(`'${tag}'`)) {
            offenders.push(`${rel}: "${tag}"`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
