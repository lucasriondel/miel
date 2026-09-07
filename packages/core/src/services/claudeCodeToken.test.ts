// claudeCodeToken: the Claude Code CLI's token, stored encrypted and settable
// at runtime — and stored *only*, with no `CLAUDE_CODE_OAUTH_TOKEN` fallback
// left (#109).
//
// Two things are asserted here that the generic store cannot assert for itself:
//
//   - the store is the single source — a token in the environment is invisible,
//     including when the store itself is unreachable, so nothing an operator
//     did not paste can end up authenticating the CLI;
//   - the status carries a hint rather than the token.
//
// Storage is the in-memory secret store (#132), injected through the `R`
// channel: no Postgres, and no `mock.module("../db/client")` fake whose
// builder chain had to match the service's queries call for call. The outage
// case — the one that used to need a `dbDown` flag threaded through every
// method of that fake — is `stores.secrets.offline`.
//
// `../env` is still mocked, so a token can be placed in the parsed environment
// anyway; that is how the "ignores it" tests prove the reader is not merely
// missing a variable that was never set.
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Effect, Exit } from "effect";
import { makeTestStores, type TestStores } from "../testkit/stores";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";
process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("k".repeat(32), "utf8").toString("base64");

afterAll(() => mock.restore());

// Keep every other env value real, and add a `CLAUDE_CODE_OAUTH_TOKEN` the real
// schema no longer has a field for — a deployment that still sets the variable
// looks exactly like this, and none of it may reach the CLI. The parsed env is
// captured *before* the mock is installed: `realEnv.getEnv` resolves through the
// (mocked) live namespace afterwards, which would recurse.
const realEnv = await import("../env");
const baseEnv = realEnv.getEnv();
mock.module("../env", () => ({
  ...realEnv,
  getEnv: () => ({ ...baseEnv, CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN }),
}));

const {
  CLAUDE_CODE_TOKEN_SECRET,
  deleteClaudeCodeTokenEffect,
  getClaudeCodeTokenStatusEffect,
  readClaudeCodeTokenEffect,
  setClaudeCodeTokenEffect,
} = await import("./claudeCodeToken");
const { encrypt } = await import("../util/crypto");

const STORED = "sk-ant-oat01-StoredZxqwerty3f9";
const IN_ENV = "sk-ant-oat01-LeftInTheEnvironment777";

async function captureStderr(fn: () => Promise<unknown>): Promise<string> {
  const original = process.stderr.write.bind(process.stderr);
  let captured = "";
  process.stderr.write = ((chunk: unknown) => {
    captured += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    await fn();
  } finally {
    process.stderr.write = original;
  }
  return captured;
}

let stores: TestStores;
/** The stores with the operator's token already pasted. */
let withToken: TestStores;

beforeEach(() => {
  stores = makeTestStores();
  withToken = makeTestStores({ secrets: { [CLAUDE_CODE_TOKEN_SECRET]: encrypt(STORED) } });
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
});

describe("readClaudeCodeTokenEffect", () => {
  test("answers with the stored token", async () => {
    expect(await withToken.run(readClaudeCodeTokenEffect())).toBe(STORED);
  });

  test("ignores a token left in the environment", async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = IN_ENV;

    expect(await stores.run(readClaudeCodeTokenEffect())).toBeNull();
  });

  test("is null when nothing is stored", async () => {
    expect(await stores.run(readClaudeCodeTokenEffect())).toBeNull();
  });

  // The failure has to surface. Swallowing it and answering "no token" would
  // report a missing credential to a user who pasted one, and — now that there
  // is no second source — invite them to paste it again over a store that
  // cannot hold it.
  test("fails rather than degrading when the secret store is unreachable", async () => {
    withToken.secrets.offline = true;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = IN_ENV;

    const exit = await Effect.runPromise(
      Effect.exit(withToken.provide(readClaudeCodeTokenEffect())),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  test("writes no token to stderr", async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = IN_ENV;
    const written = await captureStderr(() => withToken.run(readClaudeCodeTokenEffect()));

    expect(written).not.toContain(STORED);
    expect(written).not.toContain(IN_ENV);
  });
});

describe("getClaudeCodeTokenStatusEffect", () => {
  test("reports the stored token as configured, with a hint", async () => {
    expect(await withToken.run(getClaudeCodeTokenStatusEffect())).toEqual({
      configured: true,
      hint: "sk-ant-…3f9",
    });
  });

  test("reports not configured when only the environment has a token", async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = IN_ENV;

    expect(await stores.run(getClaudeCodeTokenStatusEffect())).toEqual({
      configured: false,
      hint: null,
    });
  });

  test("reports not configured when nothing is stored", async () => {
    expect(await stores.run(getClaudeCodeTokenStatusEffect())).toEqual({
      configured: false,
      hint: null,
    });
  });

  test("carries no token in the response", async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = IN_ENV;
    const status = await withToken.run(getClaudeCodeTokenStatusEffect());

    expect(JSON.stringify(status)).not.toContain(STORED);
    expect(JSON.stringify(status)).not.toContain(IN_ENV);
  });
});

describe("setClaudeCodeTokenEffect", () => {
  test("stores ciphertext under the token's own name and answers configured", async () => {
    const status = await stores.run(setClaudeCodeTokenEffect(STORED));

    expect(stores.secrets.writes.length).toBe(1);
    const row = stores.secrets.writes[0];
    expect(row.name).toBe("claude_code.oauth_token");
    expect(row.ciphertext).not.toContain(STORED);
    expect(status).toEqual({ configured: true, hint: "sk-ant-…3f9" });
    // And it reads back — the round trip, not just the write.
    expect(await stores.run(readClaudeCodeTokenEffect())).toBe(STORED);
  });

  test("rejects a token below the minimum length without storing or echoing it", async () => {
    const short = "sk-x";
    const err = await stores.run(setClaudeCodeTokenEffect(short)).catch((e: unknown) => e);

    expect((err as { _tag?: string })._tag).toBe("InvalidSecretError");
    expect(JSON.stringify(err)).not.toContain(short);
    expect(stores.secrets.writes).toEqual([]);
  });

  test("writes nothing containing the token to stderr", async () => {
    const written = await captureStderr(() => stores.run(setClaudeCodeTokenEffect(STORED)));
    expect(written).not.toContain(STORED);
  });
});

describe("deleteClaudeCodeTokenEffect", () => {
  test("clears the stored token and reports nothing left", async () => {
    const status = await withToken.run(deleteClaudeCodeTokenEffect());

    expect(status).toEqual({ configured: false, hint: null });
    expect(await withToken.run(readClaudeCodeTokenEffect())).toBeNull();
  });

  // Nothing takes over from a cleared token — an environment variable least of
  // all, which is the whole point of clearing it.
  test("reports nothing left even when the environment still has a token", async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = IN_ENV;

    expect(await withToken.run(deleteClaudeCodeTokenEffect())).toEqual({
      configured: false,
      hint: null,
    });
    expect(await withToken.run(readClaudeCodeTokenEffect())).toBeNull();
  });
});
