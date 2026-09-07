// The pure kernel of the save-time provider doors (#124).
//
// One rule protects the user: a task must not point at a hosted Provider that
// has no stored credential, and must not name a model that Provider does not
// serve. It used to be enforced by two inline guards in the API's settings
// route — so a direct core call walked past it, and the route carried its own
// copy of the service's "a provider switch with no model named lands on that
// vendor's default" rule.
//
// The kernel is a function of three values: the patch, what is stored, and
// which vendors have a key. No database, no module mock — which matters in this
// package, where a `mock.module` of the db client is process-global.
import { describe, expect, test } from "bun:test";
import { CREDENTIAL_PROVIDERS, defaultModelFor, type CredentialProvider } from "../providerModels";
import { ProviderNotRunnableError } from "../errors";
import {
  rejectCredentialDeletion,
  rejectModelPatch,
  resolvedTaskProvider,
  settingsAfterPatch,
  taskProviderProblem,
} from "./taskProviders";
import { normalizeModelSettings, type ModelSettings } from "./settings";

const DEFAULTS = normalizeModelSettings({});
const NOTHING_CONFIGURED: ReadonlySet<CredentialProvider> = new Set();
const configuredSet = (...providers: CredentialProvider[]) => new Set(providers);
const ALL_CONFIGURED = configuredSet(...CREDENTIAL_PROVIDERS);

describe("the local CLI is always runnable at save time", () => {
  test("needs no stored credential", () => {
    expect(taskProviderProblem("triage", DEFAULTS, NOTHING_CONFIGURED)).toBeNull();
  });

  test("so a fresh install, which has no credential at all, passes every task", () => {
    for (const task of ["triage", "reply", "filter"] as const) {
      expect(taskProviderProblem(task, DEFAULTS, NOTHING_CONFIGURED)).toBeNull();
    }
  });

  test("and its own model stays editable with no credential anywhere", () => {
    expect(
      rejectModelPatch({ replyModel: "claude-opus-4-7" }, DEFAULTS, NOTHING_CONFIGURED),
    ).toBeNull();
  });
});

describe("a hosted provider needs a stored credential", () => {
  test("refuses the vendor being selected when no key is stored", () => {
    const rejection = rejectModelPatch(
      { triageProvider: "anthropic" },
      DEFAULTS,
      NOTHING_CONFIGURED,
    );

    expect(rejection).toBeInstanceOf(ProviderNotRunnableError);
    expect(rejection?.reason).toBe("missing_provider_credential");
    expect(rejection?.task).toBe("triage");
    expect(rejection?.provider).toBe("anthropic");
  });

  test("accepts the same vendor once its key is stored", () => {
    expect(
      rejectModelPatch({ triageProvider: "anthropic" }, DEFAULTS, configuredSet("anthropic")),
    ).toBeNull();
  });

  test("checks the vendor being selected, not some other one that has a key", () => {
    const rejection = rejectModelPatch(
      { filterProvider: "google", filterModel: "gemini-2.5-pro" },
      DEFAULTS,
      configuredSet("anthropic"),
    );

    expect(rejection?.provider).toBe("google");
    expect(rejection?.task).toBe("filter");
  });

  test("names the first task in the request that cannot run", () => {
    const rejection = rejectModelPatch(
      { triageProvider: "anthropic", replyProvider: "openai" },
      DEFAULTS,
      configuredSet("anthropic"),
    );

    expect(rejection?.provider).toBe("openai");
    expect(rejection?.task).toBe("reply");
  });

  // The door #117 closed, and the reason the check is not guarded on the patch
  // naming a provider: a model-only edit resolves its vendor from the stored
  // row, and that vendor's key can have gone away since it was chosen.
  test("refuses a model-only patch against the stored vendor with no key", () => {
    const current: ModelSettings = { ...DEFAULTS, triageProvider: "anthropic" };

    const rejection = rejectModelPatch(
      { triageModel: "claude-sonnet-4-6" },
      current,
      NOTHING_CONFIGURED,
    );

    expect(rejection?.reason).toBe("missing_provider_credential");
    expect(rejection?.task).toBe("triage");
    expect(rejection?.provider).toBe("anthropic");
  });

  test("accepts the same model-only patch once that vendor's key is stored", () => {
    const current: ModelSettings = { ...DEFAULTS, triageProvider: "anthropic" };

    expect(
      rejectModelPatch({ triageModel: "claude-sonnet-4-6" }, current, configuredSet("anthropic")),
    ).toBeNull();
  });

  test("leaves a task the patch does not touch alone", () => {
    // A vendor whose key went away out of band must not make every unrelated
    // save fail; the user is editing triage, not filter.
    const current: ModelSettings = {
      ...DEFAULTS,
      filterProvider: "openai",
      filterModel: "o4-mini",
    };

    expect(
      rejectModelPatch({ triageModel: "claude-sonnet-4-6" }, current, NOTHING_CONFIGURED),
    ).toBeNull();
  });
});

describe("the model has to be one the provider serves", () => {
  test("refuses another vendor's model id, and says which model", () => {
    const rejection = rejectModelPatch(
      { triageProvider: "google", triageModel: "gpt-4.1" },
      DEFAULTS,
      ALL_CONFIGURED,
    );

    expect(rejection?.reason).toBe("invalid_model_for_provider");
    expect(rejection?.provider).toBe("google");
    expect(rejection?.model).toBe("gpt-4.1");
  });

  test("refuses a model change against the provider already in force", () => {
    const current: ModelSettings = { ...DEFAULTS, replyProvider: "openai", replyModel: "gpt-4.1" };

    const rejection = rejectModelPatch({ replyModel: "claude-opus-4-7" }, current, ALL_CONFIGURED);

    expect(rejection?.reason).toBe("invalid_model_for_provider");
    expect(rejection?.task).toBe("reply");
  });

  // The rule the route used to restate under a comment saying it mirrored the
  // service. It is not restated any more: the kernel checks the rows the patch
  // would write, so whatever the service does with a provider-only patch is
  // what gets checked.
  test("does not read a provider-only switch as keeping the outgoing model id", () => {
    const current: ModelSettings = {
      ...DEFAULTS,
      triageProvider: "anthropic",
      triageModel: "claude-haiku-4-5",
    };

    expect(rejectModelPatch({ triageProvider: "openai" }, current, ALL_CONFIGURED)).toBeNull();
  });

  test("leaves a model id stored before the catalogue existed where it is", () => {
    const current: ModelSettings = { ...DEFAULTS, filterModel: "some-old-custom-id" };

    expect(
      rejectModelPatch({ triageModel: "claude-sonnet-4-6" }, current, NOTHING_CONFIGURED),
    ).toBeNull();
  });

  test("checks the value that would be stored, not the raw one handed in", () => {
    // A still-open browser tab holding a pre-#105 bundle can PUT a prefixed id;
    // the service normalizes it on the way to the row, so the check sees the
    // normalized one rather than refusing what it is about to write.
    expect(
      rejectModelPatch(
        { triageModel: "anthropic/claude-sonnet-4-6" },
        DEFAULTS,
        NOTHING_CONFIGURED,
      ),
    ).toBeNull();
  });

  test("normalizes a legacy provider name before checking it", () => {
    const rejection = rejectModelPatch(
      { triageProvider: "hosted-api" as never },
      DEFAULTS,
      NOTHING_CONFIGURED,
    );

    expect(rejection?.provider).toBe("anthropic");
  });
});

describe("settingsAfterPatch", () => {
  test("is the rows the patch turns into, read back as settings", () => {
    const after = settingsAfterPatch({ triageProvider: "openai" }, DEFAULTS);

    expect(after.triageProvider).toBe("openai");
    expect(after.triageModel).toBe(defaultModelFor("openai"));
    expect(after.replyProvider).toBe(DEFAULTS.replyProvider);
    expect(after.replyModel).toBe(DEFAULTS.replyModel);
  });

  test("leaves everything alone for an empty patch", () => {
    expect(settingsAfterPatch({}, DEFAULTS)).toEqual(DEFAULTS);
  });
});

describe("deleting a credential is the other door into the same state", () => {
  test("refuses the key of the vendor a task is pointed at, naming that task", () => {
    const current: ModelSettings = { ...DEFAULTS, triageProvider: "anthropic" };

    const rejection = rejectCredentialDeletion("anthropic", current);

    expect(rejection?.reason).toBe("missing_provider_credential");
    expect(rejection?.task).toBe("triage");
    expect(rejection?.provider).toBe("anthropic");
  });

  test("names whichever task holds the vendor, not always triage", () => {
    const current: ModelSettings = { ...DEFAULTS, replyProvider: "openai" };

    expect(rejectCredentialDeletion("openai", current)?.task).toBe("reply");
  });

  test("allows the key of a vendor no task is pointed at", () => {
    expect(rejectCredentialDeletion("google", DEFAULTS)).toBeNull();
  });
});

describe("resolveTaskProvider's pure half", () => {
  test("is the provider and the model that task runs on", () => {
    const current: ModelSettings = {
      ...DEFAULTS,
      replyProvider: "openai",
      replyModel: "gpt-4.1",
    };

    expect(resolvedTaskProvider("reply", current)).toEqual({
      task: "reply",
      provider: "openai",
      model: "gpt-4.1",
    });
  });

  test("carries no credential field — nothing here decrypts", () => {
    const resolved = resolvedTaskProvider("triage", DEFAULTS);

    expect(Object.keys(resolved).toSorted()).toEqual(["model", "provider", "task"]);
  });
});

describe("which side raised the refusal", () => {
  // The same refusal means two different things to a boundary (#125): refusing
  // an edit is the user's input being wrong, refusing a run is an install that
  // cannot do the work it is configured for. `phase` is how the two stay
  // distinguishable by a field rather than by which route happened to catch it.
  test("every save-time door refuses in the save phase", () => {
    const patch = rejectModelPatch({ triageProvider: "anthropic" }, DEFAULTS, NOTHING_CONFIGURED);
    const deletion = rejectCredentialDeletion("anthropic", {
      ...DEFAULTS,
      triageProvider: "anthropic",
    });

    expect(patch?.phase).toBe("save");
    expect(deletion?.phase).toBe("save");
  });

  test("the kernel refuses in whichever phase it was asked about", () => {
    const current: ModelSettings = { ...DEFAULTS, triageProvider: "anthropic" };

    expect(taskProviderProblem("triage", current, NOTHING_CONFIGURED, "run")?.phase).toBe("run");
    expect(taskProviderProblem("triage", current, NOTHING_CONFIGURED)?.phase).toBe("save");
  });
});

describe("the rejection itself", () => {
  test("carries the task, the vendor, a reason code and the phase, and no key", () => {
    const rejection = rejectModelPatch(
      { triageProvider: "anthropic" },
      DEFAULTS,
      NOTHING_CONFIGURED,
    );

    expect(rejection).not.toBeNull();
    expect(Object.keys(rejection as object).toSorted()).toEqual([
      "_tag",
      "phase",
      "provider",
      "reason",
      "task",
    ]);
  });

  test("is tagged, so a boundary can map it without instanceof", () => {
    const rejection = rejectCredentialDeletion("anthropic", {
      ...DEFAULTS,
      triageProvider: "anthropic",
    });

    expect(rejection?._tag).toBe("ProviderNotRunnableError");
  });
});
