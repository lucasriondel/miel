// Service tests for the Effect-based `Claude` (claude/Claude.ts). The CLI
// transport is `effect-ai-claude-code`, so the subprocess is faked at that
// provider's own seam — `ClaudeCodeTest.make`, a `ChildProcessSpawner` that
// hands back a canned capture — rather than by mocking anything of miel's. The
// real arg assembly, envelope parse and error routing all still run against
// that capture, and the code under test maps the result onto miel's taxonomy.
//
// The environment is still mocked; the model settings and the Claude Code
// token come from the in-memory stores (#132), seeded per test — a row is how
// a test says "a token is configured" and an empty store is how it says "none
// is". We then assert run("triage", …) maps each CLI outcome to the right
// tagged error, and that every task goes through the same transport branch
// (#128).
// Run: bun test src/claude/Claude.test.ts
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Effect, Exit } from "effect";
import { ClaudeCodeTest } from "effect-ai-claude-code";
import { defaultModelFor, MODEL_TASKS, type ModelTask, type Provider } from "../providerModels";
import type { PromoExtractInputT } from "../schemas/promo";
import type { ReplyGenInputT } from "../schemas/reply";
import type { TriageInputT } from "../schemas/triage";
import type { Claude as ClaudeTag } from "./Claude";
import { runExit, expectFailureTag, expectSuccess } from "../testkit/runExit";
import { makeTestStores, type TestStores } from "../testkit/stores";
import type { Stores } from "../stores/contracts";

// ── spawn / env fakes ────────────────────────────────────────────────────────
// `spawnResult` is mutated per test before exercising the service; the
// provider's deep-fake spawner hands it back, so no subprocess is ever
// launched. This is the seam the CLI transport actually has: `ClaudeCodeTest`
// slots in where Bun's `ChildProcessSpawner` would, and the provider's real
// arg assembly, envelope parse and typed errors all run against the canned
// capture — which is then mapped onto miel's taxonomy by the code under test.
//
// It is scoped rather than process-wide: `_setSpawnerLayerForTests` is set and
// cleared by this file alone, so no other suite's meaning of a module changes
// because this one loaded.
//
// Settings are not mocked at all: the real service reads them out of a seeded
// store. Nor is the hosted transport — what this file has to prove about
// routing is that a hosted provider never reaches the CLI, which the spawn
// counter below shows directly.
const realEnv = await import("../env");

/** What the fake CLI prints: stream-json lines on stdout, then exits. */
type SpawnResult = { stdout: ReadonlyArray<object | string>; stderr: string; exitCode: number };
let spawnResult: SpawnResult;
let spawnCalls: number;
let lastSpawn: ClaudeCodeTest.Spawn | null;

/** The provider's fake spawner, recording each launch and answering with the canned capture. */
const testSpawner = ClaudeCodeTest.make((spawn) => {
  spawnCalls += 1;
  lastSpawn = spawn;
  return spawnResult;
});

/** The model id the CLI reports back, in its `init` envelope. */
const RESOLVED_MODEL = "claude-haiku-4-5";
const SESSION_ID = "sess-test-1";

/**
 * A success run as the CLI actually emits one in stream-json: the `init`
 * envelope carrying the session and the resolved model, then the `result`
 * envelope carrying the validated `structured_output`.
 *
 * `session_id` and the model are not decoration: the transport reads the run
 * id and the resolved model out of them, and a success envelope missing its
 * `structured_output` is a malformed answer rather than a blank one.
 */
const successLines = (structuredOutput: unknown): ReadonlyArray<object> => [
  {
    type: "system",
    subtype: "init",
    session_id: SESSION_ID,
    model: RESOLVED_MODEL,
    claude_code_version: "2.1.283",
  },
  {
    type: "result",
    subtype: "success",
    is_error: false,
    structured_output: structuredOutput,
    session_id: SESSION_ID,
    modelUsage: { [RESOLVED_MODEL]: { inputTokens: 10, outputTokens: 5 } },
    usage: { input_tokens: 10, output_tokens: 5 },
    total_cost_usd: 0.001,
  },
];

// `getEnv` reads `process.env` live (no caching). CLAUDE_BIN + the
// prompt-builder fields get harmless defaults. There is no token field: the
// environment holds no AI credential, which is what the fake store below exists
// to stand in for.
mock.module("../env", () => ({
  ...realEnv,
  getEnv: () => ({
    CLAUDE_BIN: process.env.CLAUDE_BIN ?? "claude",
    DATABASE_URL: process.env.DATABASE_URL ?? "postgres://test:test@localhost/test",
    API_SECRET: "test-secret",
    API_PORT: 3001,
  }),
}));

// The Claude Code token is a row in `encrypted_secrets` and is read from
// nowhere else (#109), so a seeded secret store is how a test here says "a
// token is configured" and, by holding no row, "none is". Encryption is real,
// so what the service reads back is what it would read back from Postgres —
// and the store, like the real one, only ever sees ciphertext.
//
// Only the token's own row is ever seeded. The vendor rows stay empty on
// purpose: the routing tests below need a hosted provider to have no
// credential, so that what fails is the credential lookup rather than a real
// call out to a vendor.
process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.from("k".repeat(32), "utf8").toString("base64");
const { encrypt } = await import("../util/crypto");
const { CLAUDE_CODE_TOKEN_SECRET } = await import("../services/claudeCodeToken");
const { SETTING_KEYS } = await import("../services/settings");

// Long enough to clear the store's minimum length; its value is only ever
// compared against what the spawn fake was handed.
const TOKEN = "sk-ant-oat01-claude-service-test";

let stores: TestStores;

/**
 * The stores as an install with this triage provider looks — the token pasted
 * unless a test asks for none, and every task pointed at a model the catalogue
 * lists. The model ids are real ones because the service resolves the task's
 * provider *and* model before it runs (#125): an id no provider serves is now
 * refused there, which is a different test from any of these.
 */
const seed = (opts: { provider?: string; token?: string | null } = {}): TestStores => {
  const { provider = "claude-code", token = TOKEN } = opts;
  // That provider's own default, the way a save through the picker leaves it:
  // another vendor's id would be refused for being the wrong model rather than
  // for the missing key these tests are about.
  const model = defaultModelFor(provider as Provider);
  return makeTestStores({
    settings: Object.fromEntries(
      MODEL_TASKS.flatMap((task) => [
        [SETTING_KEYS[`${task}Provider`], provider],
        [SETTING_KEYS[`${task}Model`], model],
      ]),
    ),
    secrets: token === null ? {} : { [CLAUDE_CODE_TOKEN_SECRET]: encrypt(token) },
  });
};

// Import the live layer AFTER the env mock is registered.
const { ClaudeLive, Claude, _setSpawnerLayerForTests } = await import("./Claude");

// Every spawn in this file goes through the fake; nothing else in the suite
// touches the spawner, so it is set once and never restored mid-run.
_setSpawnerLayerForTests(testSpawner);

const run = <A, E>(eff: Effect.Effect<A, E, ClaudeTag | Stores>) =>
  runExit(stores.provide(Effect.provide(eff, ClaudeLive)));

// Empty `messages` is fine: run() hands the input straight to the task's prompt
// builder without re-running TriageInput's `.min(1)` zod check.
const TRIAGE_INPUT: TriageInputT = {
  account: "a@b.c",
  accountId: "acc1",
  messages: [],
};

const REPLY_INPUT: ReplyGenInputT = {
  from: "sender@example.com",
  to: ["a@b.c"],
  subject: "Invoice",
  body: "the body",
  userInstruction: "say thanks",
};

const PROMO_INPUT: PromoExtractInputT = {
  from: "Zara <newsletter@example.com>",
  subject: "Your 20% weekend",
  receivedAt: "2026-09-05T09:12:00.000Z",
  body: "Take 20% off with code WEEKEND20. Ends Sunday.",
};

/** One input per task, so the transport branch can be swept over all of them. */
const INPUTS = {
  triage: TRIAGE_INPUT,
  reply: REPLY_INPUT,
  "promo-extract": PROMO_INPUT,
} as const;

/** An output each task's own schema accepts. */
const OUTPUTS = {
  triage: { results: [] },
  reply: { subject: "Re: Invoice", body: "thanks" },
  "promo-extract": {
    promos: [
      {
        code: "WEEKEND20",
        discount: "20% off",
        terms: null,
        expiresAt: "2026-09-06",
        merchant: "Zara",
      },
    ],
  },
} satisfies Record<ModelTask, unknown>;

// `as never`: at each call site the pairing of task and input is checked, but a
// loop over the tasks holds the union of all three and only the table knows
// which goes with which. That is exactly what tasks.test.ts pins.
const runTask = (task: ModelTask) =>
  run(Effect.flatMap(Claude, (s) => s.run(task, INPUTS[task] as never)));

describe("Claude.run('triage')", () => {
  beforeEach(() => {
    spawnResult = { stdout: [], stderr: "", exitCode: 0 };
    spawnCalls = 0;
    lastSpawn = null;
    process.env.CLAUDE_BIN = "claude";
    stores = seed();
  });

  // No row in the store, and no environment to fall back to since #109: the
  // error is the one this has always raised.
  test("missing token fails with ClaudeTokenMissingError before any spawn", async () => {
    stores = seed({ token: null });
    const exit = await run(Effect.flatMap(Claude, (s) => s.run("triage", TRIAGE_INPUT)));
    expectFailureTag(exit, "ClaudeTokenMissingError");
    expect(spawnCalls).toBe(0);
  });

  // The stored token is what the subprocess is handed, under the variable name
  // the CLI itself reads. That the store is the only source is
  // claudeCodeToken.test.ts's to prove.
  test("hands the stored token to the subprocess env", async () => {
    spawnResult = { stdout: successLines({ results: [] }), stderr: "", exitCode: 0 };
    expectSuccess(await run(Effect.flatMap(Claude, (s) => s.run("triage", TRIAGE_INPUT))));

    expect(lastSpawn?.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN);
  });

  test("a good envelope (is_error:false, exit 0) parses to the structured output", async () => {
    spawnResult = { stdout: successLines({ results: [] }), stderr: "", exitCode: 0 };
    const exit = await run(Effect.flatMap(Claude, (s) => s.run("triage", TRIAGE_INPUT)));
    const res = expectSuccess(exit);
    expect(res.output.results).toEqual([]);
    expect(res.runId).toBe(SESSION_ID);
    expect(res.model).toBe(RESOLVED_MODEL);
  });

  test("non-JSON stdout on a clean exit fails with ClaudeParseError", async () => {
    spawnResult = { stdout: ["not json at all"], stderr: "", exitCode: 0 };
    const exit = await run(Effect.flatMap(Claude, (s) => s.run("triage", TRIAGE_INPUT)));
    expectFailureTag(exit, "ClaudeParseError");
  });

  test("a non-zero exit whose stderr looks like a login problem fails with ClaudeAuthError", async () => {
    spawnResult = { stdout: [], stderr: "Not logged in / please run /login", exitCode: 1 };
    const exit = await run(Effect.flatMap(Claude, (s) => s.run("triage", TRIAGE_INPUT)));
    expectFailureTag(exit, "ClaudeAuthError");
  });

  test("a generic non-zero exit fails with ClaudeSpawnError", async () => {
    spawnResult = { stdout: [], stderr: "boom: segfault", exitCode: 1 };
    const exit = await run(Effect.flatMap(Claude, (s) => s.run("triage", TRIAGE_INPUT)));
    expectFailureTag(exit, "ClaudeSpawnError");
  });

  // A valid envelope whose `structured_output` is not what the task's schema
  // says — the model broke its contract, which is a schema error and not a
  // parse error or a spawn problem.
  test("a structured output the schema refuses fails with ClaudeSchemaError", async () => {
    spawnResult = { stdout: successLines({ nonsense: true }), stderr: "", exitCode: 0 };
    const exit = await run(Effect.flatMap(Claude, (s) => s.run("triage", TRIAGE_INPUT)));
    expectFailureTag(exit, "ClaudeSchemaError");
  });
});

// Which transport runs is the provider's decision, and only one of them spawns.
describe("Claude.run provider routing (#105)", () => {
  beforeEach(() => {
    spawnResult = { stdout: successLines({ results: [] }), stderr: "", exitCode: 0 };
    spawnCalls = 0;
    stores = seed();
  });

  test("claude-code spawns the CLI", async () => {
    expectSuccess(await run(Effect.flatMap(Claude, (s) => s.run("triage", TRIAGE_INPUT))));

    expect(spawnCalls).toBe(1);
  });

  // The hosted path is exercised in hosted.test.ts through the transport's own
  // seam; here the secret store holds no credential row, so the run never gets
  // as far as a transport. It must not fall back to the subprocess and quietly
  // triage somewhere the user did not pick.
  test.each(["anthropic", "google", "openai"])("%s never reaches the CLI", async (provider) => {
    stores = seed({ provider });
    const exit = await run(Effect.flatMap(Claude, (s) => s.run("triage", TRIAGE_INPUT)));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(spawnCalls).toBe(0);
  });

  // #125: the provider is resolved before a transport is chosen, so a vendor
  // with no stored key fails as an unrunnable provider — not as a vendor call
  // that went wrong, which is what a HostedApiError means from here on.
  test.each(["anthropic", "google", "openai"])(
    "%s with no stored key fails resolution, not the vendor call",
    async (provider) => {
      stores = seed({ provider });

      const exit = await run(Effect.flatMap(Claude, (s) => s.run("triage", TRIAGE_INPUT)));

      expectFailureTag(exit, "ProviderNotRunnableError");
      expect(JSON.stringify(exit)).toContain("missing_provider_credential");
    },
  );

  // A model no provider serves is the resolver's other refusal, and it lands
  // before the CLI too — the same rule the picker enforces at save time.
  test("a model the provider does not serve is refused before the CLI runs", async () => {
    stores = makeTestStores({
      settings: {
        [SETTING_KEYS.triageProvider]: "claude-code",
        [SETTING_KEYS.triageModel]: "gpt-4.1",
      },
      secrets: { [CLAUDE_CODE_TOKEN_SECRET]: encrypt(TOKEN) },
    });

    const exit = await run(Effect.flatMap(Claude, (s) => s.run("triage", TRIAGE_INPUT)));

    expectFailureTag(exit, "ProviderNotRunnableError");
    expect(spawnCalls).toBe(0);
  });
});

// #128: one `run(task, input)` over the task table, so the transport branch is
// written once and every task gets the same one. The three tasks used to have a
// method each, and the third one to be added would have been the fourth copy of
// this `if`. What is swept here is that each task takes both routes correctly —
// the same assertions the triage-only suite above makes, made for all of them.
describe("Claude.run over the task table (#128)", () => {
  beforeEach(() => {
    spawnCalls = 0;
    lastSpawn = null;
    stores = seed();
  });

  test.each([...MODEL_TASKS])("%s spawns the CLI once and parses its own output", async (task) => {
    spawnResult = { stdout: successLines(OUTPUTS[task]), stderr: "", exitCode: 0 };

    const result = expectSuccess(await runTask(task));

    expect(spawnCalls).toBe(1);
    expect(result.output).toEqual(OUTPUTS[task]);
  });

  // The tools are the task's, from its row — triage has the body-fetch escape
  // hatch and the others have nothing to reach for.
  test.each([
    ["triage", true],
    ["reply", false],
    ["promo-extract", false],
  ] as const)("%s passes --allowedTools only when its row lists one", async (task, hasTools) => {
    spawnResult = { stdout: successLines(OUTPUTS[task]), stderr: "", exitCode: 0 };

    expectSuccess(await runTask(task));

    expect(lastSpawn?.args.includes("--allowedTools")).toBe(hasTools);
  });

  // The schema is what constrains the model, and it is the task's own.
  test.each([...MODEL_TASKS])("%s sends its own schema as --json-schema", async (task) => {
    spawnResult = { stdout: successLines(OUTPUTS[task]), stderr: "", exitCode: 0 };

    expectSuccess(await runTask(task));

    const args = lastSpawn?.args ?? [];
    const schema = JSON.parse(args[args.indexOf("--json-schema") + 1] ?? "null");
    expect(Object.keys(schema.properties)).toEqual(Object.keys(OUTPUTS[task]));
  });

  // The other side of the one branch: a vendor with no stored key stops every
  // task the same way, before a transport is chosen. Before #128 this was three
  // copies of the check and only one of them was under test.
  test.each([...MODEL_TASKS])(
    "%s refuses a keyless hosted vendor and never spawns",
    async (task) => {
      stores = seed({ provider: "anthropic" });

      const exit = await runTask(task);

      expectFailureTag(exit, "ProviderNotRunnableError");
      expect(JSON.stringify(exit)).toContain(task);
      expect(spawnCalls).toBe(0);
    },
  );

  // The CLI transport's failure mapping is the run's, not triage's: a task
  // added tomorrow gets it without writing anything.
  test.each([...MODEL_TASKS])("%s maps a login failure to ClaudeAuthError", async (task) => {
    spawnResult = { stdout: [], stderr: "Not logged in / please run /login", exitCode: 1 };

    expectFailureTag(await runTask(task), "ClaudeAuthError");
  });
});
