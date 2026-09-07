// encryptedSecrets: the LLM provider API key lives in Postgres, encrypted at
// rest, and only ever leaves this service masked (`sk-ant-…3f9`) or as a
// boolean. The name-keyed half (#109) inherits that contract for every other
// secret the table holds, and is asserted at the bottom of this file.
//
// What is asserted here is the whole security contract of #104:
//
//   - what reaches the store is ciphertext, never the key;
//   - what the outward-facing calls return carries a hint, never the key;
//   - nothing written to stderr (createDebug) contains the key;
//   - a rejected key is not echoed back in the error message.
//
// The store is the in-memory adapter from `../testkit/stores` (#132), injected
// through the `R` channel. It replaces a `mock.module("../db/client")` fake that
// hand-rolled the exact builder chain the service happened to call —
// insert().values().onConflictDoUpdate(), select().from().where().limit(),
// delete().where().returning() — which meant these tests asserted query shapes
// and, being process-global, leaked into every other suite in the run. Nothing
// is mocked here now, so nothing leaks, and rewriting a query breaks nothing.
//
// Note what the fake store still proves about the boundary: it can only ever
// see ciphertext, because that is what the contract carries.
import { beforeEach, describe, expect, test } from "bun:test";
import { makeTestStores, type TestStores } from "../testkit/stores";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";
// A real 32-byte key, so stored values are genuinely encrypted rather than
// taking util/crypto's dev `plain:` fallback.
process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("k".repeat(32), "utf8").toString("base64");

const {
  CREDENTIAL_PROVIDERS,
  deleteProviderCredentialEffect,
  deleteSecretEffect,
  getProviderCredentialStatusEffect,
  getSecretStatusEffect,
  maskCredential,
  readProviderCredentialEffect,
  readSecretEffect,
  setProviderCredentialEffect,
  setSecretEffect,
  setWorpApiKeyEffect,
} = await import("./encryptedSecrets");
const { WORP_API_KEY_SECRET } = await import("../worpConfig");
const { encrypt, decrypt } = await import("../util/crypto");

const KEY = "sk-ant-api03-Zx91qWertyuiop3f9";

/** Everything the process wrote to stderr while `fn` ran. */
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

beforeEach(() => {
  stores = makeTestStores();
});

/** The one write this test made, as the store received it. */
const onlyWrite = () => {
  expect(stores.secrets.writes.length).toBe(1);
  return stores.secrets.writes[0];
};

describe("maskCredential", () => {
  test("keeps the vendor prefix and the last three characters", () => {
    expect(maskCredential(KEY)).toBe("sk-ant-…3f9");
  });

  test("reveals nothing at all when the secret is too short to mask safely", () => {
    expect(maskCredential("sk-ant-12")).toBe("…");
  });

  test("never contains the whole secret", () => {
    expect(maskCredential(KEY)).not.toContain(KEY);
  });
});

describe("setProviderCredentialEffect", () => {
  test("stores ciphertext — the key itself never reaches the store", async () => {
    await stores.run(setProviderCredentialEffect("anthropic", KEY));

    // The row is keyed by the secret's name, which for a vendor key is the
    // vendor itself — worp's two rows share the table under dotted names.
    const row = onlyWrite();
    expect(row.name).toBe("anthropic");
    expect(row.ciphertext).not.toContain(KEY);
    expect(row.ciphertext.split(":").length).toBe(3); // iv:tag:ciphertext
  });

  test("re-setting a provider replaces its row rather than erroring", async () => {
    await stores.run(setProviderCredentialEffect("anthropic", KEY));
    const second = `${KEY}-rotated`;
    const status = await stores.run(setProviderCredentialEffect("anthropic", second));

    expect(status.configured).toBe(true);
    expect(stores.secrets.rows.size).toBe(1);
    expect(await stores.run(readProviderCredentialEffect("anthropic"))).toBe(second);
  });

  test("returns presence + a masked hint, never the key", async () => {
    const status = await stores.run(setProviderCredentialEffect("anthropic", KEY));

    expect(status).toEqual({ provider: "anthropic", configured: true, hint: "sk-ant-…3f9" });
    expect(JSON.stringify(status)).not.toContain(KEY);
  });

  test("trims surrounding whitespace from a pasted key", async () => {
    await stores.run(setProviderCredentialEffect("anthropic", `  ${KEY}\n`));

    expect(decrypt(onlyWrite().ciphertext)).toBe(KEY);
  });

  test("writes nothing containing the key to stderr", async () => {
    const written = await captureStderr(() =>
      stores.run(setProviderCredentialEffect("anthropic", KEY)),
    );
    expect(written).not.toContain(KEY);
    expect(written).not.toContain("Zx91qWertyuiop");
  });

  test("rejects a blank key without echoing the input", async () => {
    const err = await stores
      .run(setProviderCredentialEffect("anthropic", "   "))
      .catch((e: unknown) => e);
    expect((err as { _tag?: string })._tag).toBe("InvalidProviderCredentialError");
    expect(stores.secrets.writes).toEqual([]);
  });

  test("rejects a too-short key and does not put it in the error", async () => {
    const short = "sk-x";
    const err = await stores
      .run(setProviderCredentialEffect("anthropic", short))
      .catch((e: unknown) => e);
    expect((err as { _tag?: string })._tag).toBe("InvalidProviderCredentialError");
    expect(JSON.stringify(err)).not.toContain(short);
    expect(String((err as Error).message)).not.toContain(short);
    expect(stores.secrets.writes).toEqual([]);
  });

  test("rejects an unknown provider", async () => {
    const err = await stores
      .run(setProviderCredentialEffect("mistral" as (typeof CREDENTIAL_PROVIDERS)[number], KEY))
      .catch((e: unknown) => e);
    expect((err as { _tag?: string })._tag).toBe("InvalidProviderCredentialError");
    expect(stores.secrets.writes).toEqual([]);
  });
});

describe("getProviderCredentialStatusEffect", () => {
  test("reports not-configured with no hint when nothing is stored", async () => {
    const status = await stores.run(getProviderCredentialStatusEffect("anthropic"));
    expect(status).toEqual({ provider: "anthropic", configured: false, hint: null });
  });

  test("reports configured with a masked hint when a row exists", async () => {
    const seeded = makeTestStores({ secrets: { anthropic: encrypt(KEY) } });
    const status = await seeded.run(getProviderCredentialStatusEffect("anthropic"));
    expect(status).toEqual({ provider: "anthropic", configured: true, hint: "sk-ant-…3f9" });
  });

  test("still reports presence when the stored blob cannot be decrypted", async () => {
    // TOKEN_ENCRYPTION_KEY rotated out from under an existing row: the hint is
    // unknowable, but "a credential is set" is still true and must be shown.
    const iv = Buffer.alloc(12).toString("base64");
    const tag = Buffer.alloc(16).toString("base64");
    const seeded = makeTestStores({ secrets: { anthropic: `${iv}:${tag}:AAAA` } });
    const status = await seeded.run(getProviderCredentialStatusEffect("anthropic"));
    expect(status).toEqual({ provider: "anthropic", configured: true, hint: null });
  });
});

describe("readProviderCredentialEffect", () => {
  test("decrypts the stored blob for internal callers", async () => {
    const seeded = makeTestStores({ secrets: { anthropic: encrypt(KEY) } });
    expect(await seeded.run(readProviderCredentialEffect("anthropic"))).toBe(KEY);
  });

  test("is null when no credential is stored", async () => {
    expect(await stores.run(readProviderCredentialEffect("anthropic"))).toBeNull();
  });

  test("writes nothing containing the key to stderr", async () => {
    const seeded = makeTestStores({ secrets: { anthropic: encrypt(KEY) } });
    const written = await captureStderr(() =>
      seeded.run(readProviderCredentialEffect("anthropic")),
    );
    expect(written).not.toContain(KEY);
  });
});

describe("deleteProviderCredentialEffect", () => {
  test("drops the row and reports the credential gone", async () => {
    const seeded = makeTestStores({ secrets: { anthropic: encrypt(KEY) } });
    const status = await seeded.run(deleteProviderCredentialEffect("anthropic"));
    expect(status).toEqual({ provider: "anthropic", configured: false, hint: null });
    expect(seeded.secrets.rows.has("anthropic")).toBe(false);
    expect(await seeded.run(getProviderCredentialStatusEffect("anthropic"))).toEqual({
      provider: "anthropic",
      configured: false,
      hint: null,
    });
  });

  test("is idempotent when nothing was stored", async () => {
    const status = await stores.run(deleteProviderCredentialEffect("anthropic"));
    expect(status).toEqual({ provider: "anthropic", configured: false, hint: null });
  });
});

// ── The name-keyed half (#109) ──────────────────────────────────────────────
// The storage contract every named secret inherits, asserted through the
// generic API the Claude Code token and worp's two secrets are built on.

const NAME = "claude_code.oauth_token";
const VALUE = "sk-ant-oat01-Zx91qWertyuiop3f9";

describe("setSecretEffect", () => {
  test("stores ciphertext — the value itself never reaches the store", async () => {
    await stores.run(setSecretEffect(NAME, VALUE));

    const row = onlyWrite();
    expect(row.name).toBe(NAME);
    expect(row.ciphertext).not.toContain(VALUE);
    expect(row.ciphertext.split(":").length).toBe(3); // iv:tag:ciphertext
  });

  test("re-setting a name replaces its row rather than erroring", async () => {
    await stores.run(setSecretEffect(NAME, VALUE));
    const second = `${VALUE}-rotated`;
    await stores.run(setSecretEffect(NAME, second));

    expect(stores.secrets.rows.size).toBe(1);
    expect(await stores.run(readSecretEffect(NAME))).toBe(second);
  });

  test("returns presence + a masked hint, never the value", async () => {
    const status = await stores.run(setSecretEffect(NAME, VALUE));

    expect(status).toEqual({ configured: true, hint: "sk-ant-…3f9" });
    expect(JSON.stringify(status)).not.toContain(VALUE);
  });

  test("trims surrounding whitespace from a pasted value", async () => {
    await stores.run(setSecretEffect(NAME, `  ${VALUE}\n`));

    expect(decrypt(onlyWrite().ciphertext)).toBe(VALUE);
  });

  test("writes nothing containing the value to stderr", async () => {
    const written = await captureStderr(() => stores.run(setSecretEffect(NAME, VALUE)));
    expect(written).not.toContain(VALUE);
    expect(written).not.toContain("Zx91qWertyuiop");
  });

  test("rejects a blank value without echoing the input", async () => {
    const err = await stores.run(setSecretEffect(NAME, "   ")).catch((e: unknown) => e);
    expect((err as { _tag?: string })._tag).toBe("InvalidSecretError");
    expect((err as { reason?: string }).reason).toBe("empty");
    expect(stores.secrets.writes).toEqual([]);
  });

  test("rejects a too-short value and does not put it in the error", async () => {
    const short = "sk-x";
    const err = await stores.run(setSecretEffect(NAME, short)).catch((e: unknown) => e);
    expect((err as { _tag?: string })._tag).toBe("InvalidSecretError");
    expect((err as { reason?: string }).reason).toBe("too_short");
    expect(JSON.stringify(err)).not.toContain(short);
    expect(String((err as Error).message)).not.toContain(short);
    expect(stores.secrets.writes).toEqual([]);
  });
});

describe("getSecretStatusEffect", () => {
  test("reports not-configured with no hint when nothing is stored", async () => {
    expect(await stores.run(getSecretStatusEffect(NAME))).toEqual({
      configured: false,
      hint: null,
    });
  });

  test("reports configured with a masked hint when a row exists", async () => {
    const seeded = makeTestStores({ secrets: { [NAME]: encrypt(VALUE) } });
    expect(await seeded.run(getSecretStatusEffect(NAME))).toEqual({
      configured: true,
      hint: "sk-ant-…3f9",
    });
  });

  test("still reports presence when the stored blob cannot be decrypted", async () => {
    // TOKEN_ENCRYPTION_KEY rotated out from under an existing row: the hint is
    // unknowable, but "a secret is set" is still true and must be shown.
    const iv = Buffer.alloc(12).toString("base64");
    const tag = Buffer.alloc(16).toString("base64");
    const seeded = makeTestStores({ secrets: { [NAME]: `${iv}:${tag}:AAAA` } });
    expect(await seeded.run(getSecretStatusEffect(NAME))).toEqual({
      configured: true,
      hint: null,
    });
  });
});

describe("readSecretEffect", () => {
  test("decrypts the stored blob for internal callers", async () => {
    const seeded = makeTestStores({ secrets: { [NAME]: encrypt(VALUE) } });
    expect(await seeded.run(readSecretEffect(NAME))).toBe(VALUE);
  });

  test("is null when nothing is stored", async () => {
    expect(await stores.run(readSecretEffect(NAME))).toBeNull();
  });

  test("writes nothing containing the value to stderr", async () => {
    const seeded = makeTestStores({ secrets: { [NAME]: encrypt(VALUE) } });
    const written = await captureStderr(() => seeded.run(readSecretEffect(NAME)));
    expect(written).not.toContain(VALUE);
  });
});

// ── worp's key (#107), held to the same bar as the rest (#118) ──────────────
// It used to be the one setter here that only trimmed: a one-character key
// stored cleanly, and worp's up-front "configured" gate — the whole point of
// which is to catch a misconfiguration before a socket is opened — then passed a
// key that could only fail at the relay. It is now `setSecretEffect` under a
// name, so the checks above are its checks.
//
// Asserted through `setWorpApiKeyEffect` itself now that no suite mocks this
// module's worp accessors process-wide (#132): the alias regressed once by
// growing a body of its own, and calling it is what catches that.

const WORP_KEY = "worp_live_Zx91qWertyuiop3f9";

describe("worp's API key row", () => {
  test("stores ciphertext under worp's own name", async () => {
    const status = await stores.run(setWorpApiKeyEffect(WORP_KEY));

    const row = onlyWrite();
    expect(row.name).toBe(WORP_API_KEY_SECRET);
    expect(row.ciphertext).not.toContain(WORP_KEY);
    expect(status).toEqual({ configured: true, hint: maskCredential(WORP_KEY) });
  });

  test("rejects a too-short key with the shared reason, storing nothing", async () => {
    const short = "wk-x";
    const err = await stores.run(setWorpApiKeyEffect(short)).catch((e: unknown) => e);
    expect((err as { _tag?: string })._tag).toBe("InvalidSecretError");
    expect((err as { reason?: string }).reason).toBe("too_short");
    expect((err as { name?: string }).name).toBe(WORP_API_KEY_SECRET);
    expect(JSON.stringify(err)).not.toContain(short);
    expect(stores.secrets.writes).toEqual([]);
  });

  test("rejects a blank key rather than storing one that authenticates nothing", async () => {
    const err = await stores.run(setWorpApiKeyEffect("   ")).catch((e: unknown) => e);
    expect((err as { reason?: string }).reason).toBe("empty");
    expect(stores.secrets.writes).toEqual([]);
  });
});

describe("deleteSecretEffect", () => {
  test("drops the row and reports the secret gone", async () => {
    const seeded = makeTestStores({ secrets: { [NAME]: encrypt(VALUE) } });
    expect(await seeded.run(deleteSecretEffect(NAME))).toEqual({
      configured: false,
      hint: null,
    });
    expect(seeded.secrets.rows.has(NAME)).toBe(false);
  });

  test("is idempotent when nothing was stored", async () => {
    expect(await stores.run(deleteSecretEffect(NAME))).toEqual({
      configured: false,
      hint: null,
    });
  });
});
