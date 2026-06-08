// Adapter tests for the Claude not-logged-in detection in invokeClaude. We mock
// the shell spawn (so no real `claude` process runs) and the model settings (so
// no DB is needed), then assert runTriage maps the CLI's "Not logged in"
// envelope to a typed ClaudeNotLoggedInError rather than a generic ShellError.
// Run: bun test src/adapters/claude.test.ts
import { afterEach, expect, mock, test } from "bun:test";
import type { TriageInputT } from "../schemas/triage";

const SHELL = `${import.meta.dir}/shell.ts`;
const SETTINGS = `${import.meta.dir}/../services/settings.ts`;
const CLAUDE = `${import.meta.dir}/claude.ts`;

// Keep the real error classes (instanceof must work) and only override spawn.
const realShell = await import(SHELL);

type SpawnResult = { stdout: string; stderr: string; exitCode: number };

// Mock spawn (no real `claude`) and settings (no DB read). We deliberately do
// NOT mock ../env — invokeClaude reads CLAUDE_BIN from the real getEnv, which is
// satisfied by `--env-file=../../.env`. Mocking ../env would leak across files
// (Bun shares the module registry) and break the DB-backed tests' DATABASE_URL.
function mockSpawn(result: SpawnResult): void {
  mock.module(SHELL, () => ({
    ...realShell,
    spawnCapture: async () => result,
  }));
  mock.module(SETTINGS, () => ({
    getModelSettings: async () => ({
      triageModel: "test-model",
      replyModel: "test-model",
      filterModel: "test-model",
    }),
  }));
}

const TRIAGE_INPUT: TriageInputT = {
  account: "user@example.com",
  accountId: "acct-1",
  existingLabels: ["Work"],
  messages: [
    {
      id: "m1",
      from: "sender@example.com",
      to: ["user@example.com"],
      subject: "Hello",
      snippet: "hi",
      body: "body text",
      internalDate: "1700000000000",
      currentLabels: [],
    },
  ],
};

// `claude -p` emits a success-shaped envelope with is_error:true at exitCode 1.
const NOT_LOGGED_IN_ENVELOPE = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: true,
  result: "Not logged in · Please run /login",
  session_id: "sess-1",
});

afterEach(() => {
  mock.restore();
});

test("runTriage throws ClaudeNotLoggedInError on the not-logged-in envelope", async () => {
  mockSpawn({ stdout: NOT_LOGGED_IN_ENVELOPE, stderr: "", exitCode: 1 });
  const { createClaudeAdapter } = await import(CLAUDE);
  const { ClaudeNotLoggedInError } = await import(SHELL);

  let caught: unknown;
  try {
    await createClaudeAdapter().runTriage(TRIAGE_INPUT);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(ClaudeNotLoggedInError);
});

test("not-logged-in is detected even if it arrives on stderr", async () => {
  mockSpawn({
    stdout: "",
    stderr: "Not logged in · Please run /login",
    exitCode: 1,
  });
  const { createClaudeAdapter } = await import(CLAUDE);
  const { ClaudeNotLoggedInError } = await import(SHELL);

  let caught: unknown;
  try {
    await createClaudeAdapter().runTriage(TRIAGE_INPUT);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(ClaudeNotLoggedInError);
});

test("a normal non-zero exit is still a plain ShellError, not a login error", async () => {
  mockSpawn({ stdout: "", stderr: "boom: segfault", exitCode: 1 });
  const { createClaudeAdapter } = await import(CLAUDE);
  const { ShellError, ClaudeNotLoggedInError } = await import(SHELL);

  let caught: unknown;
  try {
    await createClaudeAdapter().runTriage(TRIAGE_INPUT);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(ShellError);
  expect(caught).not.toBeInstanceOf(ClaudeNotLoggedInError);
});

test("a claude-reported error (is_error, exit 0) is a ShellError, not a login error", async () => {
  const errEnvelope = JSON.stringify({
    type: "result",
    is_error: true,
    result: "rate limited, try again later",
  });
  mockSpawn({ stdout: errEnvelope, stderr: "", exitCode: 0 });
  const { createClaudeAdapter } = await import(CLAUDE);
  const { ShellError, ClaudeNotLoggedInError } = await import(SHELL);

  let caught: unknown;
  try {
    await createClaudeAdapter().runTriage(TRIAGE_INPUT);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(ShellError);
  expect(caught).not.toBeInstanceOf(ClaudeNotLoggedInError);
});

test("a successful triage is parsed and never trips login detection", async () => {
  const okEnvelope = JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    result: JSON.stringify({
      results: [
        {
          id: "m1",
          priority: "high",
          reasoning: "looks important",
          applyExistingLabels: ["Work"],
          suggestNewLabels: [],
        },
      ],
    }),
    session_id: "sess-ok",
    model: "test-model",
  });
  mockSpawn({ stdout: okEnvelope, stderr: "", exitCode: 0 });
  const { createClaudeAdapter } = await import(CLAUDE);

  const res = await createClaudeAdapter().runTriage(TRIAGE_INPUT);
  expect(res.output.results).toHaveLength(1);
  expect(res.output.results[0]?.priority).toBe("high");
  expect(res.runId).toBe("sess-ok");
});
