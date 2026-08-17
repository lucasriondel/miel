// One injection seam for the Claude dependency (#133), guarded by reading the
// source.
//
// There used to be two: this `Claude` tag, and a `ClaudeService` in sync whose
// only production adapter re-wrapped a promise facade over the tag. A fake
// could go in at either end, and the suites disagreed about which — so what
// this file guards against is a *re-addition*. A second wrapper compiles fine
// and every behaviour test keeps passing; only its shape gives it away.
//
// The behaviour half is elsewhere and is exercised rather than read: the sync
// suites (triage.progress, triage.providerUnavailable, syncAll.events) each
// inject a `ClaudeImpl` at `Layer.succeed(Claude, …)` and assert what the run
// does with it.
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

const SRC = new URL("../", import.meta.url).pathname;
const read = (path: string) => Bun.file(`${SRC}${path}`).text();

/** Every module in core except this one, which quotes what it forbids. */
const sourceFiles = async (): Promise<string[]> => {
  const files: string[] = [];
  for await (const file of new Glob("**/*.ts").scan({ cwd: SRC })) {
    if (file !== "claude/seam.test.ts") files.push(file);
  }
  return files;
};

/** The names a module may take from the Claude module — the seam's whole API. */
const SEAM_EXPORTS = new Set(["Claude", "ClaudeLive", "ClaudeImpl", "ClaudeRunResult"]);

const claudeImports = (source: string): string[] =>
  [...source.matchAll(/import (?:type )?\{([^}]*)\} from "[^"]*claude\/Claude"/g)].flatMap((m) =>
    m[1]
      .split(",")
      .map((name) =>
        name
          .trim()
          .replace(/^type /, "")
          .split(" as ")[0]
          .trim(),
      )
      .filter(Boolean),
  );

describe("the Claude dependency has one seam", () => {
  test("the pass-through promise facade is gone", async () => {
    expect(await Bun.file(`${SRC}claude/claudeAdapter.ts`).exists()).toBe(false);
  });

  test("nothing wraps the seam in a service or an adapter of its own", async () => {
    const wrappers = [];
    for (const file of await sourceFiles()) {
      const source = await read(file);
      // `ClaudeService` as a word also catches `ClaudeServiceAdapter`, the
      // facade's interface, and `createClaudeServiceAdapter`, its constructor.
      if (/\bClaudeService/.test(source)) wrappers.push(file);
    }
    expect(wrappers).toEqual([]);
  });

  test("everything that needs a model imports the tag, its layer or its interface", async () => {
    const unexpected: string[] = [];
    for (const file of await sourceFiles()) {
      for (const name of claudeImports(await read(file))) {
        if (!SEAM_EXPORTS.has(name)) unexpected.push(`${file}: ${name}`);
      }
    }
    expect(unexpected).toEqual([]);
  });

  test("sync yields the seam directly", async () => {
    // The two AI call sites in the pipeline. Read rather than inferred from a
    // run: what would break silently is one of them acquiring a wrapper again.
    for (const path of ["services/sync/triage.ts", "services/sync/services.ts"]) {
      const source = await read(path);
      expect(claudeImports(source).length).toBeGreaterThan(0);
    }
    expect(await read("services/sync/triage.ts")).toContain("yield* Claude");
  });
});

describe("no test reaches Claude through a module mock", () => {
  test("no suite replaces the Claude module process-wide", async () => {
    // A `mock.module` is process-global in bun: a suite that faked this module
    // would decide what Claude means for every file loaded after it. The seam
    // exists so a fake can be scoped to one effect instead.
    const mocked: string[] = [];
    for (const file of (await sourceFiles()).filter((f) => f.endsWith(".test.ts"))) {
      const source = await read(file);
      if (/mock\.module\(\s*"[^"]*[cC]laude(\/Claude|Adapter)?"/.test(source)) mocked.push(file);
    }
    expect(mocked).toEqual([]);
  });
});
