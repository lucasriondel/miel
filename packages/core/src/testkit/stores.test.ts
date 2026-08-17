// The in-memory store adapters (#132) — the second implementation of the store
// contracts, and the one every settings/secrets suite runs against.
//
// A fake that answers differently from the real thing is worse than no fake, so
// the contract itself is not restated here: `./storeContract` holds it and
// `../stores/postgres.dbtest.ts` runs the same spec against the real tables. What
// is left in this file is what is true of *this* adapter only — the recording,
// the seeding, and the outage switch — plus the one storage fact the contract
// cannot see, that an upsert leaves one row rather than two.
//
// No Postgres and no db mock: that is the whole point of the seam.
import { beforeEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { SecretStore, SettingsStore } from "../stores/contracts";
import { secretStoreContract, settingsStoreContract } from "./storeContract";
import { makeTestStores } from "./stores";

settingsStoreContract("the in-memory settings store", () => makeTestStores().layer);
secretStoreContract("the in-memory secret store", () => makeTestStores().layer);

let stores = makeTestStores();

beforeEach(() => {
  stores = makeTestStores();
});

describe("the in-memory settings store", () => {
  test("upserts rather than keeping two rows for one key", async () => {
    await stores.run(SettingsStore.write("triage.model", "a"));
    await stores.run(SettingsStore.write("triage.model", "b"));
    expect(stores.settings.rows.size).toBe(1);
  });

  test("records every write in order, for suites that assert what was stored", async () => {
    await stores.run(SettingsStore.write("a", "1"));
    await stores.run(SettingsStore.write("b", "2"));
    expect(stores.settings.writes).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ]);
  });

  test("can be seeded with rows a test wants to find already there", async () => {
    const seeded = makeTestStores({ settings: { "schedule.since": "7d" } });
    expect(await seeded.run(SettingsStore.read("schedule.since"))).toBe("7d");
    // Seeding is not a write — a suite asserting "nothing was stored" still can.
    expect(seeded.settings.writes).toEqual([]);
  });
});

describe("the in-memory secret store", () => {
  test("records writes and removals for suites that assert what was stored", async () => {
    await stores.run(SecretStore.write("anthropic", "iv:tag:cipher"));
    await stores.run(SecretStore.remove("anthropic"));
    expect(stores.secrets.writes).toEqual([{ name: "anthropic", ciphertext: "iv:tag:cipher" }]);
    expect(stores.secrets.removals).toEqual(["anthropic"]);
  });

  test("can be seeded with a ciphertext a test wants to find already stored", async () => {
    const seeded = makeTestStores({ secrets: { anthropic: "iv:tag:cipher" } });
    expect(await seeded.run(SecretStore.read("anthropic"))).toBe("iv:tag:cipher");
    expect(seeded.secrets.writes).toEqual([]);
  });
});

// An unreachable store is an outage, and a service is allowed to care: the
// Claude Code token reader must fail rather than answer "no token" when the row
// cannot be read (#109). The fake has to be able to say that.
describe("an offline store", () => {
  test("fails every read rather than answering null", async () => {
    stores.secrets.offline = true;
    const exit = await Effect.runPromise(
      Effect.exit(stores.provide(SecretStore.read("anthropic"))),
    );
    expect(exit._tag).toBe("Failure");
  });

  test("fails writes and removals too", async () => {
    stores.settings.offline = true;
    const exit = await Effect.runPromise(
      Effect.exit(stores.provide(SettingsStore.write("triage.model", "x"))),
    );
    expect(exit._tag).toBe("Failure");
    expect(stores.settings.rows.size).toBe(0);
  });
});
