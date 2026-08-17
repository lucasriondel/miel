// The checked write facades and the resolver (#124).
//
// The rule the kernel expresses has to hold for a *direct core call*, not only
// for the HTTP route that used to own it: the CLI and a future scheduler reach
// these functions, not that route. So what is asserted here is the wiring — the
// kernel runs before anything is written, a refused patch writes nothing at all,
// and the resolver answers with a provider and a model and no credential.
//
// `taskProviderDoors` is handed a fake store, which is what keeps this suite
// free of a database and of a `mock.module` of the db client — that mock is
// process-global in Bun, and two suites in this package install their own.
import { describe, expect, test } from "bun:test";
import { Effect, Either } from "effect";
import type { CredentialProvider } from "../providerModels";
import { ProviderNotRunnableError } from "../errors";
import { taskProviderDoors, type TaskProviderStore } from "./taskProviders";
import { normalizeModelSettings, type ModelSettings } from "./settings";

const DEFAULTS = normalizeModelSettings({});

interface Recorder {
  // `<never>`: this fake needs no store, so its doors run with `Effect.runSync`.
  // The live ones are instantiated at the two stores they read and write
  // through, and provide the adapters at the Promise boundary (#132). Named
  // explicitly because `ReturnType` substitutes `unknown` for a generic
  // parameter rather than its default.
  doors: ReturnType<typeof taskProviderDoors<never>>;
  writes: Array<Partial<ModelSettings>>;
  drops: CredentialProvider[];
  stored: () => ModelSettings;
}

function recordingDoors(
  current: ModelSettings = DEFAULTS,
  configured: CredentialProvider[] = [],
): Recorder {
  let settings = current;
  const writes: Array<Partial<ModelSettings>> = [];
  const drops: CredentialProvider[] = [];
  const store: TaskProviderStore = {
    readSettings: () => Effect.succeed(settings),
    readConfigured: () => Effect.succeed(new Set(configured)),
    writeSettings: (patch) => {
      writes.push(patch);
      settings = { ...settings, ...patch };
      return Effect.succeed(settings);
    },
    dropCredential: (provider) => {
      drops.push(provider);
      return Effect.succeed({ provider, configured: false, hint: null });
    },
  };
  return { doors: taskProviderDoors(store), writes, drops, stored: () => settings };
}

/** Run a door that is expected to refuse, and hand back its rejection. */
const refusalOf = <A, E>(effect: Effect.Effect<A, E>): ProviderNotRunnableError => {
  const result = Effect.runSync(Effect.either(effect));
  if (!Either.isLeft(result)) throw new Error("expected the door to refuse, but it wrote");
  expect(result.left).toBeInstanceOf(ProviderNotRunnableError);
  return result.left as ProviderNotRunnableError;
};

describe("checkedUpdateModelSettingsEffect", () => {
  test("writes a patch every touched task can run", () => {
    const { doors, writes } = recordingDoors(DEFAULTS, ["anthropic"]);

    const settings = Effect.runSync(
      doors.checkedUpdateModelSettingsEffect({
        triageProvider: "anthropic",
        triageModel: "claude-sonnet-4-6",
      }),
    );

    expect(writes).toEqual([{ triageProvider: "anthropic", triageModel: "claude-sonnet-4-6" }]);
    expect(settings.triageProvider).toBe("anthropic");
  });

  // The criterion the route cannot satisfy on its own: the same call, made from
  // core, is refused the same way.
  test("refuses a hosted vendor with no stored key", () => {
    const { doors, writes } = recordingDoors();

    const refusal = refusalOf(doors.checkedUpdateModelSettingsEffect({ replyProvider: "openai" }));

    expect(refusal.reason).toBe("missing_provider_credential");
    expect(refusal.task).toBe("reply");
    expect(writes).toEqual([]);
  });

  test("refuses a two-task patch whole, writing neither half", () => {
    const { doors, writes, stored } = recordingDoors(DEFAULTS, ["anthropic"]);

    const refusal = refusalOf(
      doors.checkedUpdateModelSettingsEffect({
        triageProvider: "anthropic",
        replyProvider: "openai",
      }),
    );

    expect(refusal.provider).toBe("openai");
    expect(writes).toEqual([]);
    // Not even the half that would have been fine.
    expect(stored().triageProvider).toBe(DEFAULTS.triageProvider);
  });

  test("refuses a model the vendor does not serve before writing anything", () => {
    const { doors, writes } = recordingDoors(DEFAULTS, ["google"]);

    const refusal = refusalOf(
      doors.checkedUpdateModelSettingsEffect({
        filterProvider: "google",
        filterModel: "gpt-4.1",
      }),
    );

    expect(refusal.reason).toBe("invalid_model_for_provider");
    expect(refusal.model).toBe("gpt-4.1");
    expect(writes).toEqual([]);
  });
});

describe("checkedDeleteProviderCredentialEffect", () => {
  test("drops the key of a vendor no task is pointed at", () => {
    const { doors, drops } = recordingDoors(DEFAULTS, ["google"]);

    const status = Effect.runSync(doors.checkedDeleteProviderCredentialEffect("google"));

    expect(drops).toEqual(["google"]);
    expect(status).toEqual({ provider: "google", configured: false, hint: null });
  });

  test("refuses the key a task is running on, dropping nothing", () => {
    const current: ModelSettings = { ...DEFAULTS, triageProvider: "anthropic" };
    const { doors, drops } = recordingDoors(current, ["anthropic"]);

    const refusal = refusalOf(doors.checkedDeleteProviderCredentialEffect("anthropic"));

    expect(refusal.task).toBe("triage");
    expect(drops).toEqual([]);
  });
});

describe("resolveTaskProviderEffect", () => {
  test("answers with the provider and model the task runs on", () => {
    const current: ModelSettings = { ...DEFAULTS, replyProvider: "openai", replyModel: "gpt-4.1" };
    const { doors } = recordingDoors(current, ["openai"]);

    expect(Effect.runSync(doors.resolveTaskProviderEffect("reply"))).toEqual({
      task: "reply",
      provider: "openai",
      model: "gpt-4.1",
    });
  });

  test("resolves the local CLI with no credential stored anywhere", () => {
    const { doors } = recordingDoors();

    expect(Effect.runSync(doors.resolveTaskProviderEffect("triage")).provider).toBe("claude-code");
  });

  test("fails with the same rejection when the vendor's key has gone away", () => {
    const current: ModelSettings = {
      ...DEFAULTS,
      filterProvider: "openai",
      filterModel: "o4-mini",
    };
    const { doors } = recordingDoors(current, []);

    const refusal = refusalOf(doors.resolveTaskProviderEffect("filter"));

    expect(refusal.reason).toBe("missing_provider_credential");
    expect(refusal.provider).toBe("openai");
  });

  // What #125 turns on: the run path fails here, before a transport opens a
  // socket, and its refusal says it came from a run — which is what lets the
  // API answer "this install cannot do that" rather than "your edit is wrong".
  test("its refusal is a run-phase one, not a refused edit", () => {
    const current: ModelSettings = { ...DEFAULTS, replyProvider: "anthropic" };
    const { doors } = recordingDoors(current, []);

    expect(refusalOf(doors.resolveTaskProviderEffect("reply")).phase).toBe("run");
  });

  test("carries no credential — the store is only ever asked for booleans", () => {
    const { doors } = recordingDoors(DEFAULTS, ["anthropic"]);

    const resolved = Effect.runSync(doors.resolveTaskProviderEffect("triage"));

    expect(Object.keys(resolved).toSorted()).toEqual(["model", "provider", "task"]);
  });
});
