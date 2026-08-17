// The model/provider half of the settings service (#105).
//
// Two rules that outlive one release each:
//
//   - rows written before #105 are read back in the new vocabulary. The
//     provider `hosted-api` becomes `anthropic` and a `vendor/` prefix is
//     stripped off a model id, so an install that upgrades keeps triaging with
//     the vendor it was already using instead of silently reverting.
//   - switching provider without naming a model lands on that vendor's default
//     rather than leaving the previous vendor's model id in place, which the
//     settings route would then reject.
//
// Both are pure functions of what is stored, so this needs no Postgres and no
// module mock of the db client — that mock is process-global in Bun and this
// package has a suite that installs its own.
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PROVIDER,
  MODEL_TASKS as CATALOGUE_MODEL_TASKS,
  defaultModelFor,
  isModelForProvider,
} from "../providerModels";
import {
  MODEL_TASKS,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  modelSettingWrites,
  normalizeModelSettings,
  type ModelSettings,
  type ModelTask,
} from "./settings";

const DEFAULTS = normalizeModelSettings({});

// Issue #123. The list is defined in the catalogue leaf now, so `errors.ts` can
// type a `task` field without importing a service. It is still exported from
// here under the same name — the barrel and the API's settings route import it
// from this module, and a move that renamed their import would be a change to
// every caller for no reason.
describe("MODEL_TASKS re-exported from the settings service (#123)", () => {
  test("is the catalogue's own list, not a second copy of it", () => {
    expect(MODEL_TASKS).toBe(CATALOGUE_MODEL_TASKS);
  });

  test("the type comes with it, so a caller needs one import and not two", () => {
    const task: ModelTask = "reply";

    expect(MODEL_TASKS).toContain(task);
  });

  test("every task still has both settings keys the service builds from it", () => {
    for (const task of MODEL_TASKS) {
      expect(SETTING_KEYS[`${task}Provider`]).toBeString();
      expect(SETTING_KEYS[`${task}Model`]).toBeString();
    }
  });
});

describe("normalizeModelSettings on rows written before #105", () => {
  test("reads the retired `hosted-api` provider as anthropic", () => {
    const settings = normalizeModelSettings({ [SETTING_KEYS.triageProvider]: "hosted-api" });

    expect(settings.triageProvider).toBe("anthropic");
  });

  test("strips the vendor prefix a model id used to carry", () => {
    const settings = normalizeModelSettings({
      [SETTING_KEYS.triageModel]: "anthropic/claude-haiku-4-5",
    });

    expect(settings.triageModel).toBe("claude-haiku-4-5");
  });

  test("leaves current values alone", () => {
    const settings = normalizeModelSettings({
      [SETTING_KEYS.replyProvider]: "openai",
      [SETTING_KEYS.replyModel]: "gpt-4.1",
    });

    expect(settings.replyProvider).toBe("openai");
    expect(settings.replyModel).toBe("gpt-4.1");
  });

  test("falls back to the local CLI when nothing is stored", () => {
    expect(DEFAULTS.triageProvider).toBe("claude-code");
    expect(DEFAULTS.filterProvider).toBe("claude-code");
    expect(DEFAULTS.triageModel).toBe("claude-haiku-4-5");
  });
});

// Issue #112. A fresh install is not inert: with no settings row at all, all
// three tasks resolve to a provider and run. Which one is a documented fact, so
// the three defaults are built from the exported constant the README and the
// landing-page guide are checked against, rather than from three literals that
// can be edited one at a time.
describe("the provider a fresh install starts on", () => {
  test.each(["triageProvider", "replyProvider", "filterProvider"] as const)(
    "%s defaults to DEFAULT_PROVIDER",
    (key) => {
      expect(SETTING_DEFAULTS[SETTING_KEYS[key]]).toBe(DEFAULT_PROVIDER);
      expect(DEFAULTS[key]).toBe(DEFAULT_PROVIDER);
    },
  );

  // The models are picked per task rather than taken from the catalogue — reply
  // deliberately starts on a stronger one than triage — but each has to be a
  // model that provider actually serves, or the first sync 400s.
  test("every task's default model is one that provider serves", () => {
    for (const model of [DEFAULTS.triageModel, DEFAULTS.replyModel, DEFAULTS.filterModel]) {
      expect(isModelForProvider(DEFAULT_PROVIDER, model)).toBe(true);
    }
  });
});

const writesFor = (patch: Partial<ModelSettings>, current: ModelSettings = DEFAULTS) =>
  modelSettingWrites(patch, current);

describe("modelSettingWrites", () => {
  test("switching provider with no model named picks that vendor's default", () => {
    const writes = writesFor({ triageProvider: "google" });

    expect(writes).toContainEqual({ key: SETTING_KEYS.triageProvider, value: "google" });
    expect(writes).toContainEqual({
      key: SETTING_KEYS.triageModel,
      value: defaultModelFor("google"),
    });
  });

  test("an explicit model wins over the vendor default", () => {
    const writes = writesFor({ replyProvider: "openai", replyModel: "gpt-4.1" });

    expect(writes).toContainEqual({ key: SETTING_KEYS.replyModel, value: "gpt-4.1" });
  });

  test("re-selecting the provider already in force does not reset the model", () => {
    const current: ModelSettings = {
      ...DEFAULTS,
      filterProvider: "openai",
      filterModel: "o4-mini",
    };

    const writes = writesFor({ filterProvider: "openai" }, current);

    expect(writes).toEqual([{ key: SETTING_KEYS.filterProvider, value: "openai" }]);
  });

  test("changing only the model leaves the provider where it was", () => {
    const current: ModelSettings = { ...DEFAULTS, triageProvider: "anthropic" };

    const writes = writesFor({ triageModel: "claude-sonnet-4-6" }, current);

    expect(writes).toEqual([{ key: SETTING_KEYS.triageModel, value: "claude-sonnet-4-6" }]);
  });

  test("normalizes a legacy provider handed in by an old client", () => {
    // A still-open browser tab holding the previous bundle can PUT it.
    const writes = writesFor({ triageProvider: "hosted-api" as never });

    expect(writes).toContainEqual({ key: SETTING_KEYS.triageProvider, value: "anthropic" });
  });

  test("writes nothing for a patch that names no model setting", () => {
    expect(writesFor({})).toEqual([]);
  });
});
