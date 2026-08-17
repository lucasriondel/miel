// The seam itself (#132), guarded by reading the source: the two services it
// was drawn for must reach storage only through a store, and a store must not
// be able to see a secret.
//
// Source checks rather than behaviour tests because what they guard against is
// a *re-addition* — one `getDb()` back inside a service is invisible to every
// other test here (it would just start needing Postgres again), and one import
// of `util/crypto` in an adapter would quietly move the decryptor.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

/** Services that now own rules only, with their queries behind a store. */
const SEAMED_SERVICES = [
  "../services/settings.ts",
  "../services/encryptedSecrets.ts",
  "../services/claudeCodeToken.ts",
  // The mailbox aggregates (#136).
  "../services/messages.ts",
  "../services/apply.ts",
  "../services/labels.ts",
  // It composes the settings and secret services rather than querying anything
  // itself, and since #125 its resolver is on the run path — so where it answers
  // the requirement matters to more than a save.
  "../services/taskProviders.ts",
];

/** Everything that is a way of talking to Postgres directly. */
const DIRECT_DB = ["db/client", "db/schema", "drizzle-orm"];

describe("the services reach the database only through a store", () => {
  test.each(SEAMED_SERVICES)("%s imports nothing that talks to Postgres", async (path) => {
    const source = await read(path);
    const imports = source.match(/from "[^"]+"/g) ?? [];
    for (const spec of DIRECT_DB) {
      expect(imports.filter((i) => i.includes(spec))).toEqual([]);
    }
    // …and does not reach the client some other way.
    expect(source).not.toContain("getDb(");
  });

  test.each(SEAMED_SERVICES)("%s provides an adapter at its Promise facades", async (path) => {
    // The `R` channel is what forces this, but the facades are where production
    // answers it — a service that stopped providing one would not compile, and
    // a service that provided the *testkit* one would.
    const source = await read(path);
    expect(source).toContain("../stores/postgres");
    expect(source).not.toContain("testkit");
  });
});

describe("a store sees ciphertext only", () => {
  test.each(["./postgres.ts", "../testkit/stores.ts", "../testkit/mailbox.ts"])(
    "%s cannot encrypt or decrypt",
    async (path) => {
      const source = await read(path);
      expect(source).not.toContain('from "../util/crypto"');
      expect(source).not.toContain('from "../../util/crypto"');
    },
  );

  test("the secret contract is written in ciphertext, not values", async () => {
    const source = await read("./contracts.ts");
    const contract = source.slice(source.indexOf("export interface SecretStoreImpl"));
    expect(contract).toContain("ciphertext");
    expect(contract).not.toContain("plaintext");
  });
});

// Two implementations only make the seam real while they answer the same way,
// which is what one shared spec run against both is for — and the Postgres half
// only runs it honestly in a process no other suite's `mock.module("db/client")`
// has reached first. Both halves of that arrangement are easy to undo by
// accident (drop a call, rename the file into bun's glob), and neither failure
// is visible: the suite would go on passing, against a Map or against a fake.
describe("both adapters are held to one contract", () => {
  const APPLIES_CONTRACT = ["../testkit/stores.test.ts", "./postgres.dbtest.ts"];

  test.each(APPLIES_CONTRACT)("%s runs the shared spec", async (path) => {
    const source = await read(path);
    expect(source).toContain("storeContract");
    expect(source).toContain("settingsStoreContract(");
    expect(source).toContain("secretStoreContract(");
  });

  test("the Postgres suite stays out of the sweep's collection glob", async () => {
    // `.test.ts` would put it back in `bun test ./src`, where another suite's
    // process-global db fake answers its reads.
    const dbtest = await read("./postgres.dbtest.ts");
    expect(dbtest).toContain("SettingsStoreLive");
    expect(Bun.file(new URL("./postgres.test.ts", import.meta.url)).size).toBe(0);
  });

  test("the test script runs it by path, in a process of its own", async () => {
    // Out of the glob and out of the script is out of the gate entirely.
    const script = await read("../../scripts/test-with-db.sh");
    expect(script).toContain("bun test ./src/stores/postgres.dbtest.ts");
  });
});

// The seam has two implementations, and exactly one of them is allowed to ship.
// A module that runs in production importing `testkit/stores` is the seam's
// worst failure and its quietest: settings would be written to a Map and lost on
// restart, a pasted credential would never reach `encrypted_secrets`, and not one
// test would notice — every suite injects its own stores, so all of them go on
// passing. Nothing else here can catch it, because the mistake is *not* reaching
// Postgres, which is what every other assertion in this file looks for.
describe("the in-memory adapter cannot ship", () => {
  const src = join(import.meta.dir, "..");

  /** Every `.ts` under src, tagged with whether it is test-only. */
  const modules = (() => {
    const out: Array<{ path: string; text: string; shipped: boolean }> = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.name.endsWith(".ts")) continue;
        const rel = relative(src, path);
        out.push({
          path: rel,
          text: readFileSync(path, "utf8"),
          // The testkit is test-only wholesale; so is anything named as a test.
          shipped: !rel.startsWith("testkit") && !/\.(test|dbtest)\.ts$/.test(entry.name),
        });
      }
    };
    walk(src);
    return out;
  })();

  /** An import of the testkit — static, dynamic or required. Not a mention of it. */
  const IMPORTS_TESTKIT = /(?:from|import|require)\s*\(?\s*"[^"]*testkit\/[^"]*"/;

  test("the walk sees the package, and the detector sees a real import", () => {
    // Both halves matter: a walk that matched nothing, or a pattern that matched
    // nothing, would pass the assertion below while checking nothing at all.
    expect(modules.filter((m) => m.shipped).length).toBeGreaterThan(50);
    const injectors = modules.filter((m) => !m.shipped && IMPORTS_TESTKIT.test(m.text));
    expect(injectors.length).toBeGreaterThan(5);
  });

  test("nothing that ships imports it", () => {
    const leaked = modules.filter((m) => m.shipped && IMPORTS_TESTKIT.test(m.text));
    expect(leaked.map((m) => m.path)).toEqual([]);
  });

  test("and the package offers no way in from outside core", async () => {
    // A store is a seam *within* core: every caller outside it reaches settings
    // and secrets through a Promise facade that provides Postgres itself. The
    // barrel and the subpath exports are the two doors, and adding the testkit
    // to either is how the fake would become reachable from @miel/api.
    const barrel = await read("../index.ts");
    expect(barrel).not.toMatch(/from "\.\/(?:stores|testkit)\//);
    const manifest = JSON.parse(await read("../../package.json")) as {
      exports: Record<string, string>;
    };
    const doors = Object.values(manifest.exports);
    expect(doors.filter((target) => /\/(?:stores|testkit)\//.test(target))).toEqual([]);
  });
});
