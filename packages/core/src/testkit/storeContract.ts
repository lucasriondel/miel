/**
 * The contract both store adapters have to satisfy (#132), written once and run
 * against each of them.
 *
 * Two implementations are what make the seam real — but only if they answer the
 * same way. `testkit/stores.ts` is what every settings and secrets suite runs
 * against, so a Map that upserts differently from `ON CONFLICT`, or that hands
 * back `undefined` where a row is missing, would make those suites agree with
 * each other and with nothing that ships. This module is the shared spec that
 * keeps the fake honest: `stores/postgres.dbtest.ts` applies it to the real
 * tables, `testkit/stores.test.ts` to the Map, and neither file restates it.
 *
 * Everything here goes through the tags. There is no assertion about a row
 * count, a query or a Map — those belong to whichever adapter has them, and are
 * asserted in that adapter's own file beside this suite's call.
 *
 * Keys and names are unique per test and per process, so the suite is safe to
 * run against a shared database: two adapters, or two runs of one, never
 * collide, and nothing has to be torn down between tests for a "no row yet"
 * assertion to hold. {@link CONTRACT_KEY_PREFIX} is what a database-backed
 * adapter's file sweeps away afterwards.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { Effect, type Layer } from "effect";
import { SecretStore, SettingsStore } from "../stores/contracts";

/** Every key and name this suite writes starts with it. */
export const CONTRACT_KEY_PREFIX = "storecontract.";

const RUN = crypto.randomUUID().slice(0, 8);
let counter = 0;

/** A key/name no other test — or earlier run against the same database — used. */
const freshKey = (what: string) => `${CONTRACT_KEY_PREFIX}${RUN}.${what}.${counter++}`;

/**
 * Values a store must hand back byte for byte. A ciphertext is `iv:tag:cipher`
 * base64, so the separators and the padding matter; a setting can legitimately
 * be empty (an unset worp base URL is stored as `""`).
 */
const VERBATIM = ["", " ", "a:b:c", "AAAA/BBB+CCC=", "µ nordic ø — 日本語", "x".repeat(4096)];

/**
 * Run the {@link SettingsStore} contract against `layerFor()`, which is called
 * once per test: an adapter that keeps state in the layer gets a fresh one, and
 * one that talks to a database can return the same live layer every time.
 */
export function settingsStoreContract(
  label: string,
  layerFor: () => Layer.Layer<SettingsStore>,
): void {
  describe(`${label} satisfies the SettingsStore contract`, () => {
    let run = <A>(eff: Effect.Effect<A, never, SettingsStore>): Promise<A> =>
      Effect.runPromise(Effect.provide(eff, layerFor()));

    beforeEach(() => {
      const layer = layerFor();
      run = (eff) => Effect.runPromise(Effect.provide(eff, layer));
    });

    test("answers null — not undefined — for a key with no row", async () => {
      expect(await run(SettingsStore.read(freshKey("missing")))).toBeNull();
    });

    test("reads back the value it was given", async () => {
      const key = freshKey("readback");
      await run(SettingsStore.write(key, "7d"));
      expect(await run(SettingsStore.read(key))).toBe("7d");
    });

    test("a second write to a key replaces the first, rather than adding a row", async () => {
      const key = freshKey("upsert");
      await run(SettingsStore.write(key, "a"));
      await run(SettingsStore.write(key, "b"));
      expect(await run(SettingsStore.read(key))).toBe("b");
    });

    test("keys do not see each other", async () => {
      const [one, two] = [freshKey("one"), freshKey("two")];
      await run(SettingsStore.write(one, "1"));
      expect(await run(SettingsStore.read(two))).toBeNull();
      await run(SettingsStore.write(two, "2"));
      expect(await run(SettingsStore.read(one))).toBe("1");
    });

    test.each(VERBATIM)("stores %j verbatim", async (value) => {
      const key = freshKey("verbatim");
      await run(SettingsStore.write(key, value));
      expect(await run(SettingsStore.read(key))).toBe(value);
    });
  });
}

/**
 * Run the {@link SecretStore} contract against `layerFor()`. Same shape as the
 * settings contract plus the removal, which is the operation with a return
 * value worth pinning: the delete route answers 404 on a 0.
 */
export function secretStoreContract(label: string, layerFor: () => Layer.Layer<SecretStore>): void {
  describe(`${label} satisfies the SecretStore contract`, () => {
    let run = <A>(eff: Effect.Effect<A, never, SecretStore>): Promise<A> =>
      Effect.runPromise(Effect.provide(eff, layerFor()));

    beforeEach(() => {
      const layer = layerFor();
      run = (eff) => Effect.runPromise(Effect.provide(eff, layer));
    });

    test("answers null — not undefined — for a name with no row", async () => {
      expect(await run(SecretStore.read(freshKey("missing")))).toBeNull();
    });

    test("reads back the ciphertext it was given", async () => {
      const name = freshKey("readback");
      await run(SecretStore.write(name, "iv:tag:cipher"));
      expect(await run(SecretStore.read(name))).toBe("iv:tag:cipher");
    });

    test("a second write to a name replaces the ciphertext", async () => {
      const name = freshKey("upsert");
      await run(SecretStore.write(name, "iv:tag:first"));
      await run(SecretStore.write(name, "iv:tag:second"));
      expect(await run(SecretStore.read(name))).toBe("iv:tag:second");
    });

    test("names do not see each other", async () => {
      const [one, two] = [freshKey("one"), freshKey("two")];
      await run(SecretStore.write(one, "iv:tag:one"));
      expect(await run(SecretStore.read(two))).toBeNull();
      await run(SecretStore.write(two, "iv:tag:two"));
      expect(await run(SecretStore.read(one))).toBe("iv:tag:one");
    });

    test("a removal reports the row it took, and the name reads null after", async () => {
      const name = freshKey("remove");
      await run(SecretStore.write(name, "iv:tag:cipher"));
      expect(await run(SecretStore.remove(name))).toBe(1);
      expect(await run(SecretStore.read(name))).toBeNull();
    });

    test("removing a name with no row is 0, not a failure", async () => {
      expect(await run(SecretStore.remove(freshKey("never-stored")))).toBe(0);
    });

    test("a removal takes one name only", async () => {
      const [gone, kept] = [freshKey("gone"), freshKey("kept")];
      await run(SecretStore.write(gone, "iv:tag:gone"));
      await run(SecretStore.write(kept, "iv:tag:kept"));
      await run(SecretStore.remove(gone));
      expect(await run(SecretStore.read(kept))).toBe("iv:tag:kept");
    });

    test.each(VERBATIM)("stores %j verbatim", async (ciphertext) => {
      const name = freshKey("verbatim");
      await run(SecretStore.write(name, ciphertext));
      expect(await run(SecretStore.read(name))).toBe(ciphertext);
    });
  });
}
