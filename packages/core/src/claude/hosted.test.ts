// The hosted (HTTP) path, exercised through the `Claude` service — the
// transport itself lives in `ai-task-runner-effect` and has its own suite
// there; what this file proves is miel's half of the contract (#105, #125):
//
//   - the vendor named by the provider is what the call is made against, with
//     that vendor's stored key (#104) and the bare model id — the key read out
//     of the in-memory secret store, so the whole path a key takes is real:
//     stored ciphertext, decrypted by the one decryptor, handed to the call;
//   - a key that cannot be read at run time classifies as the resolver's own
//     ProviderNotRunnableError (run phase), not as a vendor failure — and the
//     run never quietly goes somewhere else;
//   - a key never appears in an error detail, including when the vendor call
//     throws a message quoting it, and a payload the task's schema refuses
//     surfaces as a HostedApiError exactly as before.
//
// The fake sits at the runner's own seam (`_setHostedGenerateForTests` →
// `HostedGenerate`), so the real credential read, provider resolution and
// error mapping all run; no network, no module mocks.
// Run: bun test src/claude/hosted.test.ts
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Effect } from "effect";
import { expectFailureTag, expectSuccess, runExit } from "../testkit/runExit";
import type { CredentialProvider } from "../credentialProviders";
import { defaultModelFor, MODEL_TASKS } from "../providerModels";
import type { TriageOutputT } from "../schemas/triage";
import type { Stores } from "../stores/contracts";
import { makeTestStores, type TestStores } from "../testkit/stores";
import type { Claude as ClaudeTag } from "./Claude";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";
process.env.API_SECRET ??= "hosted-suite-secret";
// A real 32-byte key: the seeded rows are genuinely encrypted, so the service
// decrypts them the way it would decrypt a row out of Postgres.
process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("k".repeat(32), "utf8").toString("base64");

// A bun module mock is process-global and outlives `mock.restore`, and this
// file may be the first to load `prompts.ts` — so the fake reads API_SECRET
// live, the way the real getEnv does, rather than freezing a value that
// prompts.test.ts asserts against later in the same process.
const realEnv = await import("../env");
mock.module("../env", () => ({
  ...realEnv,
  getEnv: () => ({
    CLAUDE_BIN: "claude",
    DATABASE_URL: process.env.DATABASE_URL,
    API_SECRET: process.env.API_SECRET,
    API_PORT: 3001,
  }),
}));
afterAll(() => {
  mock.restore();
  // bun shares globals across test files: leave the runner's hosted seam the
  // way other suites expect to find it.
  _setHostedGenerateForTests(null);
});

const KEY = "sk-ant-api03-Zx91qWertyuiop3f9";

const { encrypt } = await import("../util/crypto");
const { SETTING_KEYS } = await import("../services/settings");
const { Claude, ClaudeLive, _setHostedGenerateForTests } = await import("./Claude");

let stores: TestStores;
/** Every call the fake transport received, with what reached it. */
let calls: Array<{
  vendor: string;
  modelId: string;
  apiKey: string;
  system: string;
  prompt: string;
}> = [];
let generateResult: () => Promise<unknown>;

_setHostedGenerateForTests(async (args) => {
  calls.push({
    vendor: args.vendor,
    modelId: args.modelId,
    apiKey: args.apiKey,
    system: args.system,
    prompt: args.prompt,
  });
  return generateResult();
});

/** The stores as an install pointing every task at this vendor looks. */
const withVendor = (
  provider: CredentialProvider,
  opts: { key?: string | null; ciphertext?: string } = {},
): TestStores => {
  const { key = KEY } = opts;
  const model = defaultModelFor(provider);
  return makeTestStores({
    settings: Object.fromEntries(
      MODEL_TASKS.flatMap((task) => [
        [SETTING_KEYS[`${task}Provider`], provider],
        [SETTING_KEYS[`${task}Model`], model],
      ]),
    ),
    secrets:
      opts.ciphertext !== undefined
        ? { [provider]: opts.ciphertext }
        : key === null
          ? {}
          : { [provider]: encrypt(key) },
  });
};

const TRIAGE_OBJECT: TriageOutputT = {
  results: [
    {
      id: "m1",
      priority: "high",
      reasoning: "because",
      applyExistingLabels: [],
      suggestNewLabels: [],
    },
  ],
};

const TRIAGE_INPUT = {
  account: "a@b.c",
  accountId: "acc1",
  existingLabels: [],
  messages: [],
};

beforeEach(() => {
  calls = [];
  generateResult = async () => TRIAGE_OBJECT;
});

const run = <A, E>(eff: Effect.Effect<A, E, ClaudeTag | Stores>) =>
  runExit(stores.provide(Effect.provide(eff, ClaudeLive)));

const triage = () => run(Effect.flatMap(Claude, (s) => s.run("triage", TRIAGE_INPUT)));

describe("the hosted path picks the vendor from the provider", () => {
  test.each(["anthropic", "google", "openai"] as const)(
    "%s is called with its own stored key and its bare default model",
    async (provider) => {
      stores = withVendor(provider);

      const result = expectSuccess(await triage());

      expect(calls).toHaveLength(1);
      const call = calls[0]!;
      expect(call.vendor).toBe(provider);
      expect(call.apiKey).toBe(KEY);
      expect(call.modelId).toBe(defaultModelFor(provider));
      expect(result.model).toBe(defaultModelFor(provider));
      expect(result.runId).toStartWith(`hosted-${provider}-`);
      expect(result.output).toEqual(TRIAGE_OBJECT);
    },
  );

  test("sends the hosted prompt as system and the task's instruction as the turn", async () => {
    stores = withVendor("openai");

    expectSuccess(await triage());

    const call = calls[0]!;
    expect(call.system.length).toBeGreaterThan(0);
    // The CLI column is the one allowed to carry the bearer token; the hosted
    // one must not (see tasks.test.ts for the full sweep).
    expect(call.system).not.toContain(process.env.API_SECRET!);
    expect(call.prompt).toBe("Return the triage analysis as JSON.");
  });
});

describe("a key that cannot be read at run time", () => {
  // The resolver checks presence, not readability: a row that exists but does
  // not decrypt (written under another TOKEN_ENCRYPTION_KEY, corrupted) passes
  // resolution and then fails the read — the race-guard path, classified as
  // the resolver's own refusal so a boundary cannot tell the two apart (#125).
  test("classifies as ProviderNotRunnableError (run phase), not a vendor failure", async () => {
    stores = withVendor("google", { ciphertext: "not-real-ciphertext" });

    const exit = await triage();

    expectFailureTag(exit, "ProviderNotRunnableError");
    const failure = JSON.stringify(exit);
    expect(failure).toContain("missing_provider_credential");
    expect(failure).toContain("google");
    // A run-phase refusal: the request that hit it is not what is wrong.
    expect(failure).toContain("run");
    // Nothing was sent anywhere.
    expect(calls).toEqual([]);
  });

  test("carries no user-facing prose — copy lives at the edges that own it", async () => {
    stores = withVendor("google", { ciphertext: "not-real-ciphertext" });

    const failure = JSON.stringify(await triage());

    expect(failure).not.toContain("Settings");
    expect(failure).not.toContain("ANTHROPIC_API_KEY");
  });
});

describe("the hosted path and the key", () => {
  test("keeps it out of a vendor error's detail", async () => {
    stores = withVendor("anthropic");
    generateResult = async () => {
      // The vendors do echo credentials into their error strings.
      throw new Error(`401 unauthorized for key ${KEY}`);
    };

    const exit = await triage();

    expectFailureTag(exit, "HostedApiError");
    expect(JSON.stringify(exit)).not.toContain(KEY);
  });

  test("a rejected key fails the run loudly rather than degrading", async () => {
    stores = withVendor("openai");
    generateResult = async () => {
      throw new Error("429 quota exceeded");
    };

    const exit = await triage();

    expectFailureTag(exit, "HostedApiError");
    expect(JSON.stringify(exit)).toContain("quota");
  });

  test("a vendor object that violates the task schema is a HostedApiError", async () => {
    stores = withVendor("anthropic");
    generateResult = async () => ({ nonsense: true });

    expectFailureTag(await triage(), "HostedApiError");
  });
});
