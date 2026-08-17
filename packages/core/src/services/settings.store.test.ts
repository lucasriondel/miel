// settings, through the store seam (#132). No Postgres, no `mock.module`, no
// hand-built query-builder chain: the real service runs against the in-memory
// adapter, so what is asserted is what the module means — a stored row wins, a
// missing one falls back to the published default, an unknown key with no
// default fails, a clamp is applied on the way in and on the way out.
//
// The queries themselves are `stores/postgres.ts`'s business now. Rewriting one
// breaks nothing here, which is the point.
import { beforeEach, describe, expect, test } from "bun:test";
import { Effect, Exit } from "effect";
import { makeTestStores, type TestStores } from "../testkit/stores";
import {
  SETTING_DEFAULTS,
  SETTING_KEYS,
  getScheduleSettingsEffect,
  getSettingEffect,
  getTriageBatchSettingsEffect,
  setSettingEffect,
  updateModelSettingsEffect,
  updateScheduleSettingsEffect,
  updateTriageBatchSettingsEffect,
} from "./settings";
import { DEFAULT_PROVIDER } from "../providerModels";

let stores: TestStores;

beforeEach(() => {
  stores = makeTestStores();
});

describe("getSettingEffect", () => {
  test("answers the stored row when there is one", async () => {
    await stores.run(setSettingEffect(SETTING_KEYS.scheduleSince, "7d"));
    expect(await stores.run(getSettingEffect(SETTING_KEYS.scheduleSince))).toBe("7d");
  });

  test("falls back to the published default when nothing is stored", async () => {
    expect(await stores.run(getSettingEffect(SETTING_KEYS.triageProvider))).toBe(DEFAULT_PROVIDER);
    expect(await stores.run(getSettingEffect(SETTING_KEYS.scheduleSince))).toBe(
      SETTING_DEFAULTS[SETTING_KEYS.scheduleSince],
    );
  });

  test("fails for a key with no row and no default", async () => {
    const exit = await Effect.runPromise(
      Effect.exit(stores.provide(getSettingEffect("nothing.knows.this"))),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe("setSettingEffect", () => {
  test("stores the value under the key", async () => {
    await stores.run(setSettingEffect("triage.model", "claude-sonnet-4-6"));
    expect(stores.settings.rows.get("triage.model")).toBe("claude-sonnet-4-6");
  });

  test("replaces a value already stored under that key", async () => {
    await stores.run(setSettingEffect("triage.model", "a"));
    await stores.run(setSettingEffect("triage.model", "b"));
    expect(await stores.run(getSettingEffect("triage.model"))).toBe("b");
  });
});

describe("updateModelSettingsEffect", () => {
  test("returns the settings as they now stand, defaults included", async () => {
    const settings = await stores.run(
      updateModelSettingsEffect({ triageModel: "claude-opus-4-1" }),
    );
    expect(settings.triageModel).toBe("claude-opus-4-1");
    expect(settings.replyProvider).toBe(DEFAULT_PROVIDER);
  });

  // The rule `modelSettingWrites` exists for, asserted end-to-end this time:
  // a provider switch that names no model must not leave the old vendor's id.
  test("a provider switch with no model named takes the new provider's default", async () => {
    const settings = await stores.run(updateModelSettingsEffect({ triageProvider: "openai" }));
    expect(settings.triageProvider).toBe("openai");
    expect(settings.triageModel).not.toBe(SETTING_DEFAULTS[SETTING_KEYS.triageModel]);
    expect(stores.settings.rows.get(SETTING_KEYS.triageModel)).toBe(settings.triageModel);
  });

  test("touches only the task it was given", async () => {
    await stores.run(updateModelSettingsEffect({ replyModel: "claude-haiku-4-5" }));
    expect(stores.settings.writes).toEqual([
      { key: SETTING_KEYS.replyModel, value: "claude-haiku-4-5" },
    ]);
  });
});

describe("schedule settings", () => {
  test("read as their defaults on a fresh install", async () => {
    expect(await stores.run(getScheduleSettingsEffect())).toEqual({
      enabled: false,
      intervalMinutes: 15,
      since: "24h",
    });
  });

  test("round-trip through the store, parsed back into their types", async () => {
    const updated = await stores.run(
      updateScheduleSettingsEffect({ enabled: true, intervalMinutes: 30, since: "7d" }),
    );
    expect(updated).toEqual({ enabled: true, intervalMinutes: 30, since: "7d" });
    expect(stores.settings.rows.get(SETTING_KEYS.scheduleEnabled)).toBe("true");
  });

  test("clamp an interval below the minimum rather than storing it", async () => {
    const updated = await stores.run(updateScheduleSettingsEffect({ intervalMinutes: 0 }));
    expect(updated.intervalMinutes).toBe(1);
    expect(stores.settings.rows.get(SETTING_KEYS.scheduleIntervalMinutes)).toBe("1");
  });

  test("a garbled stored interval reads as the minimum, not NaN", async () => {
    const seeded = makeTestStores({ settings: { [SETTING_KEYS.scheduleIntervalMinutes]: "soon" } });
    expect((await seeded.run(getScheduleSettingsEffect())).intervalMinutes).toBe(1);
  });
});

describe("triage batch settings", () => {
  test("read as their defaults on a fresh install", async () => {
    expect(await stores.run(getTriageBatchSettingsEffect())).toEqual({
      batchSize: Number(SETTING_DEFAULTS[SETTING_KEYS.triageBatchSize]),
      batchConcurrency: Number(SETTING_DEFAULTS[SETTING_KEYS.triageBatchConcurrency]),
    });
  });

  test("clamp a batch size above the published cap", async () => {
    const updated = await stores.run(updateTriageBatchSettingsEffect({ batchSize: 500 }));
    expect(updated.batchSize).toBe(50);
    expect(stores.settings.rows.get(SETTING_KEYS.triageBatchSize)).toBe("50");
  });

  // Clamping on read as well as on write: a row set by hand or by an older
  // build is not allowed to send a 500-message batch to a vendor.
  test("clamp a stored batch size that was never written through the setter", async () => {
    const seeded = makeTestStores({ settings: { [SETTING_KEYS.triageBatchSize]: "500" } });
    expect((await seeded.run(getTriageBatchSettingsEffect())).batchSize).toBe(50);
  });
});
