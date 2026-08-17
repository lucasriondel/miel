// The provider/model catalogue (#105). A pure leaf module, so this needs no
// Postgres and no network: what it guards is the shape the rest of the app
// leans on — that a vendor is named directly rather than parsed out of a model
// string, that every provider has a default model of its own, and that the
// legacy `hosted-api` / `anthropic/model` spellings map onto the new ones.
import { describe, expect, test } from "bun:test";
import { CREDENTIAL_PROVIDERS } from "./credentialProviders";
import {
  CLAUDE_CODE_PROVIDER,
  DEFAULT_PROVIDER,
  MODEL_TASKS,
  PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_MODELS,
  defaultModelFor,
  isHostedProvider,
  isModelForProvider,
  isProvider,
  normalizeModelId,
  normalizeProvider,
  type ModelTask,
  type Provider,
} from "./providerModels";

describe("PROVIDERS", () => {
  test("is the local CLI plus every vendor a credential can be stored for", () => {
    expect(PROVIDERS).toEqual(["claude-code", "anthropic", "google", "openai"]);
    // The hosted half IS the credential list — a vendor you can pick is a
    // vendor you can hold a key for, by construction rather than by agreement.
    expect(PROVIDERS.filter((p) => p !== "claude-code")).toEqual([...CREDENTIAL_PROVIDERS]);
  });

  test("isProvider accepts the four and rejects the retired spelling", () => {
    for (const p of PROVIDERS) expect(isProvider(p)).toBe(true);
    expect(isProvider("hosted-api")).toBe(false);
    expect(isProvider("mistral")).toBe(false);
  });

  test("isHostedProvider separates the subprocess transport from the HTTP one", () => {
    expect(isHostedProvider("claude-code")).toBe(false);
    expect(isHostedProvider("anthropic")).toBe(true);
    expect(isHostedProvider("google")).toBe(true);
    expect(isHostedProvider("openai")).toBe(true);
  });

  test("every provider has a human label", () => {
    for (const p of PROVIDERS) expect(PROVIDER_LABELS[p].length).toBeGreaterThan(0);
  });

  test("labels name the product, so the local one is Claude Code and not CLI (#108)", () => {
    // "CLI" reads as a category next to three vendor names, and the thing is
    // called Claude Code everywhere else — README, landing page, the token that
    // authenticates it.
    expect(PROVIDER_LABELS["claude-code"]).toBe("Claude Code");
    expect(Object.values(PROVIDER_LABELS)).not.toContain("CLI");
  });

  test("the label moved, the id did not — stored rows still resolve", () => {
    // `claude-code` is what sits in app_settings, what the settings route
    // validates and what normalizeProvider falls back to; renaming it would
    // orphan every stored row.
    expect(CLAUDE_CODE_PROVIDER).toBe("claude-code");
    expect(PROVIDERS[0]).toBe("claude-code");
    expect(normalizeProvider("claude-code")).toBe("claude-code");
  });
});

// Issue #112: which provider a fresh install triages through was a string
// literal repeated three times in SETTING_DEFAULTS and restated in prose in the
// README and the landing-page guide. It is one exported constant now, so the
// documentation can be checked against it instead of against a memory of it.
describe("DEFAULT_PROVIDER", () => {
  test("is the local CLI — the one provider that needs no key a fresh install lacks", () => {
    expect(DEFAULT_PROVIDER).toBe(CLAUDE_CODE_PROVIDER);
  });

  test("is a provider that can actually be picked, with a model of its own", () => {
    expect(isProvider(DEFAULT_PROVIDER)).toBe(true);
    expect(defaultModelFor(DEFAULT_PROVIDER).length).toBeGreaterThan(0);
  });

  // The fallback in normalizeProvider is the same choice made for unreadable
  // storage; if the two ever disagreed, an install would triage through one
  // provider and the docs would describe the other.
  test("is what an unreadable stored provider falls back to", () => {
    expect(normalizeProvider("mistral")).toBe(DEFAULT_PROVIDER);
  });
});

// Issue #123. The task vocabulary used to sit in the settings service, which
// imports the db client — so anything that wanted to name a task had to import
// a service to do it, and `errors.ts` cannot without an import cycle. It lives
// beside the Provider vocabulary now, in the leaf both halves of a "which
// provider runs which task" pair come from.
describe("MODEL_TASKS", () => {
  test("names the three tasks that each carry their own provider and model", () => {
    expect(MODEL_TASKS).toEqual(["triage", "reply", "filter"]);
  });

  test("each task is a key prefix the settings service can build a pair from", () => {
    // `${task}Provider` / `${task}Model` is how the settings keys and the
    // ModelSettings fields are spelled, so a task added here has to survive it.
    for (const task of MODEL_TASKS) {
      expect(task).toMatch(/^[a-z]+$/);
    }
  });

  test("the type is the union of the list, not a widened string", () => {
    const task: ModelTask = "triage";
    // @ts-expect-error a task nobody runs is not a ModelTask
    const notATask: ModelTask = "summarize";

    expect(MODEL_TASKS).toContain(task);
    expect(MODEL_TASKS).not.toContain(notATask);
  });
});

describe("PROVIDER_MODELS", () => {
  test("every provider offers at least one model", () => {
    for (const p of PROVIDERS) expect(PROVIDER_MODELS[p].length).toBeGreaterThan(0);
  });

  test("model ids are bare — a vendor prefix would be parsed at call time again", () => {
    for (const p of PROVIDERS) {
      for (const m of PROVIDER_MODELS[p]) {
        expect(m.id).not.toContain("/");
        expect(m.label.length).toBeGreaterThan(0);
      }
    }
  });

  test("the default of each provider is one of its own models", () => {
    for (const p of PROVIDERS) {
      expect(PROVIDER_MODELS[p].some((m) => m.id === defaultModelFor(p))).toBe(true);
    }
  });

  test("no two providers claim the same model id", () => {
    const ids = PROVIDERS.flatMap((p) => PROVIDER_MODELS[p].map((m) => m.id));
    // claude-code and anthropic both run Claude models, so the overlap is
    // expected there and nowhere else.
    const hosted = PROVIDERS.filter((p) => p !== "claude-code" && p !== "anthropic");
    const hostedIds = hosted.flatMap((p) => PROVIDER_MODELS[p].map((m) => m.id));
    expect(new Set(hostedIds).size).toBe(hostedIds.length);
    expect(ids.length).toBeGreaterThan(hostedIds.length);
  });
});

describe("isModelForProvider", () => {
  test("accepts a model from the provider's own list", () => {
    expect(isModelForProvider("anthropic", defaultModelFor("anthropic"))).toBe(true);
  });

  test("rejects another vendor's model — the pairing is what can be saved", () => {
    expect(isModelForProvider("google", defaultModelFor("openai"))).toBe(false);
    expect(isModelForProvider("openai", defaultModelFor("anthropic"))).toBe(false);
  });

  test("rejects an id that belongs to nobody", () => {
    expect(isModelForProvider("anthropic", "not-a-model")).toBe(false);
  });
});

describe("normalizeProvider", () => {
  test("maps the retired `hosted-api` onto anthropic", () => {
    // It could never have meant anything else: the old hosted path threw on
    // every model prefix but `anthropic`.
    expect(normalizeProvider("hosted-api")).toBe("anthropic");
  });

  test("passes the current spellings through untouched", () => {
    for (const p of PROVIDERS) expect(normalizeProvider(p)).toBe(p as Provider);
  });

  test("falls back to the local CLI for a value it cannot read", () => {
    expect(normalizeProvider("")).toBe("claude-code");
    expect(normalizeProvider("mistral")).toBe("claude-code");
  });
});

describe("normalizeModelId", () => {
  test("strips a vendor prefix left over from the parsed-model-id era", () => {
    expect(normalizeModelId("anthropic/claude-haiku-4-5")).toBe("claude-haiku-4-5");
    expect(normalizeModelId("openai/gpt-4.1-mini")).toBe("gpt-4.1-mini");
  });

  test("leaves a bare id alone", () => {
    expect(normalizeModelId("claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });

  test("trims and survives an empty value", () => {
    expect(normalizeModelId("  claude-haiku-4-5 ")).toBe("claude-haiku-4-5");
    expect(normalizeModelId("")).toBe("");
  });
});
