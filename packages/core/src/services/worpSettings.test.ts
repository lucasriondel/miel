// worpSettings: worp's config is a runtime setting split across two stores —
// the base URL in `app_settings`, the key and the proxy header map encrypted in
// `encrypted_secrets` (#107). What is asserted here is the contract that split
// has to hold up:
//
//   - what travels outward carries a masked hint and header *names*, never a
//     secret and never ciphertext;
//   - `configured` is the same gate sendToWorp applies — both halves or off;
//   - a bad patch is refused whole, before anything is written;
//   - nothing written to stderr (createDebug) contains a secret.
//
// Both halves run for real against the in-memory stores (#132). This suite used
// to `mock.module` its way past `./settings` and `./encryptedSecrets` — six fake
// accessors, process-wide, which is why `encryptedSecrets.test.ts` could not
// call worp's own setter and had to assert it by reading the source. Now the
// only thing standing in for Postgres is a Map, the real encryption and the real
// masking run, and neither file has to know the other exists.
import { beforeEach, describe, expect, test } from "bun:test";
import { makeTestStores, type TestStores } from "../testkit/stores";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";
// A real 32-byte key, so what the store holds is genuinely ciphertext.
process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("k".repeat(32), "utf8").toString("base64");

const KEY = "worp_live_Zx91qWertyuiop3f9";
const CF_SECRET = "cf-secret-Zx91qWertyuiop000";

const { WORP_API_KEY_SECRET, WORP_BASE_URL_SETTING, WORP_EXTRA_HEADERS_SECRET } =
  await import("../worpConfig");
const { MIN_KEY_LENGTH, maskCredential } = await import("../credentialMasking");
const { getWorpSettingsEffect, updateWorpSettingsEffect } = await import("./worpSettings");
const { encrypt } = await import("../util/crypto");

/** The stores as an install with this much of worp's config stored looks. */
const seed = (
  stored: { baseUrl?: string; apiKey?: string; headers?: Record<string, string> } = {},
): TestStores =>
  makeTestStores({
    settings: stored.baseUrl === undefined ? {} : { [WORP_BASE_URL_SETTING]: stored.baseUrl },
    secrets: {
      ...(stored.apiKey === undefined ? {} : { [WORP_API_KEY_SECRET]: encrypt(stored.apiKey) }),
      ...(stored.headers === undefined
        ? {}
        : { [WORP_EXTRA_HEADERS_SECRET]: encrypt(JSON.stringify(stored.headers)) }),
    },
  });

let stores: TestStores;

beforeEach(() => {
  stores = seed();
});

const get = () => stores.run(getWorpSettingsEffect());
const update = (patch: Parameters<typeof updateWorpSettingsEffect>[0]) =>
  stores.run(updateWorpSettingsEffect(patch));
const updateFailure = async (patch: Parameters<typeof updateWorpSettingsEffect>[0]) =>
  (await update(patch).catch((e: unknown) => e)) as {
    _tag?: string;
    field?: string;
    reason?: string;
    header?: string;
  };

/** What reached each store, without decrypting anything a secret write holds. */
const settingWrites = () => stores.settings.writes;
const secretWrites = (name: string) => stores.secrets.writes.filter((w) => w.name === name);
const secretRemovals = (name: string) => stores.secrets.removals.filter((n) => n === name);

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

describe("getWorpSettings — the configured gate", () => {
  test("is off on a fresh install, with nothing stored", async () => {
    const settings = await get();
    expect(settings).toEqual({
      baseUrl: "",
      apiKey: { configured: false, hint: null },
      extraHeaders: [],
      configured: false,
    });
  });

  test("is off with only a base URL", async () => {
    stores = seed({ baseUrl: "https://worp.example.com" });
    expect((await get()).configured).toBe(false);
  });

  test("is off with only a key", async () => {
    stores = seed({ apiKey: KEY });
    expect((await get()).configured).toBe(false);
  });

  // Proxy headers configure nothing on their own — same rule sendToWorp applies.
  test("is off with only proxy headers", async () => {
    stores = seed({ headers: { "CF-Access-Client-Id": "cf-id" } });
    expect((await get()).configured).toBe(false);
  });

  test("is on once both halves are set", async () => {
    stores = seed({ baseUrl: "https://worp.example.com", apiKey: KEY });
    expect((await get()).configured).toBe(true);
  });
});

describe("getWorpSettings — what may travel outward", () => {
  beforeEach(() => {
    stores = seed({
      baseUrl: "https://worp.example.com",
      apiKey: KEY,
      headers: { "CF-Access-Client-Secret": CF_SECRET },
    });
  });

  test("returns the base URL in the clear — it is not a secret", async () => {
    expect((await get()).baseUrl).toBe("https://worp.example.com");
  });

  test("returns presence + a hint for the key, never the key", async () => {
    const settings = await get();
    expect(settings.apiKey).toEqual({ configured: true, hint: maskCredential(KEY) });
    expect(JSON.stringify(settings)).not.toContain(KEY);
  });

  // The names are shown on purpose: a mistyped one only fails when a relay
  // runs, so seeing what will be sent is how a typo gets caught early.
  test("returns header names in full but never a header value", async () => {
    const settings = await get();
    expect(settings.extraHeaders.map((h) => h.name)).toEqual(["CF-Access-Client-Secret"]);
    expect(JSON.stringify(settings)).not.toContain(CF_SECRET);
  });

  // Nothing that leaves this service carries what the store holds either.
  test("never returns the ciphertext it read", async () => {
    const settings = await get();
    const blob = stores.secrets.rows.get(WORP_API_KEY_SECRET);
    expect(blob).toBeDefined();
    expect(JSON.stringify(settings)).not.toContain(blob as string);
  });
});

describe("updateWorpSettings — writes", () => {
  test("saves a base URL and turns worp on once a key is there too", async () => {
    stores = seed({ apiKey: KEY });
    const settings = await update({ baseUrl: "https://worp.example.com" });
    expect(settingWrites()).toEqual([
      { key: WORP_BASE_URL_SETTING, value: "https://worp.example.com" },
    ]);
    expect(settings.configured).toBe(true);
  });

  test("trims a pasted base URL", async () => {
    await update({ baseUrl: "  https://worp.example.com \n" });
    expect(settingWrites()[0].value).toBe("https://worp.example.com");
  });

  // Empty is not a rejected value — it is how the relay is turned off.
  test("accepts an empty base URL and reports worp off", async () => {
    stores = seed({ baseUrl: "https://worp.example.com", apiKey: KEY });
    const settings = await update({ baseUrl: "" });
    expect(settings.baseUrl).toBe("");
    expect(settings.configured).toBe(false);
  });

  test("an omitted field leaves what is stored alone", async () => {
    stores = seed({
      baseUrl: "https://worp.example.com",
      apiKey: KEY,
      headers: { "X-Proxy": "abc" },
    });
    const settings = await update({});
    expect(settingWrites()).toEqual([]);
    expect(stores.secrets.writes).toEqual([]);
    expect(stores.secrets.removals).toEqual([]);
    expect(settings.configured).toBe(true);
    expect(settings.extraHeaders).toHaveLength(1);
  });

  test("stores the key as ciphertext, never in the clear", async () => {
    const settings = await update({ apiKey: KEY });
    const written = secretWrites(WORP_API_KEY_SECRET);
    expect(written).toHaveLength(1);
    expect(written[0].ciphertext).not.toContain(KEY);
    expect(settings.apiKey).toEqual({ configured: true, hint: maskCredential(KEY) });
  });

  test("stores a header value as ciphertext, never in the clear", async () => {
    await update({ extraHeaders: { "CF-Access-Client-Secret": CF_SECRET } });
    const written = secretWrites(WORP_EXTRA_HEADERS_SECRET);
    expect(written).toHaveLength(1);
    expect(written[0].ciphertext).not.toContain(CF_SECRET);
  });

  test("apiKey: null clears the stored key", async () => {
    stores = seed({ baseUrl: "https://worp.example.com", apiKey: KEY });
    const settings = await update({ apiKey: null });
    expect(secretRemovals(WORP_API_KEY_SECRET)).toHaveLength(1);
    expect(settings.apiKey.configured).toBe(false);
    expect(settings.configured).toBe(false);
  });

  // An empty string is the UI's other way of saying "clear it"; storing it
  // would leave a credential that authenticates nothing.
  test("an empty apiKey clears rather than storing a blank credential", async () => {
    stores = seed({ apiKey: KEY });
    await update({ apiKey: "   " });
    expect(secretRemovals(WORP_API_KEY_SECRET)).toHaveLength(1);
    expect(secretWrites(WORP_API_KEY_SECRET)).toEqual([]);
  });

  test("stores an arbitrary proxy header, not just the CF pair", async () => {
    const settings = await update({ extraHeaders: { "X-Authelia-Token": "abc" } });
    expect(settings.extraHeaders.map((h) => h.name)).toEqual(["X-Authelia-Token"]);
  });

  // The header field is a patch, not a replacement (#119). The settings UI is
  // never given the stored values, so a replacement made removing one header
  // mean retyping the others' secrets — and made a save from a page loaded
  // before someone else's save delete what that save added.
  test("removes only the header the patch names null", async () => {
    stores = seed({ headers: { "X-Proxy": "abc", "CF-Access-Client-Id": "cf-id" } });
    const settings = await update({ extraHeaders: { "X-Proxy": null } });
    expect(settings.extraHeaders.map((h) => h.name)).toEqual(["CF-Access-Client-Id"]);
  });

  test("leaves a header the patch does not name alone", async () => {
    stores = seed({ headers: { "X-Proxy": "abc" } });
    const settings = await update({ extraHeaders: { "X-Other": "def" } });
    expect(settings.extraHeaders.map((h) => h.name)).toEqual(["X-Proxy", "X-Other"]);
  });

  test("an empty header patch changes nothing", async () => {
    stores = seed({ headers: { "X-Proxy": "abc" } });
    const settings = await update({ extraHeaders: {} });
    expect(settings.extraHeaders.map((h) => h.name)).toEqual(["X-Proxy"]);
  });

  test("nulling every stored name is how the map is cleared", async () => {
    stores = seed({ headers: { "X-Proxy": "abc", "X-Other": "def" } });
    const settings = await update({ extraHeaders: { "X-Proxy": null, "X-Other": null } });
    expect(settings.extraHeaders).toEqual([]);
    // An empty map and no map mean the same thing, so the row goes rather than
    // being kept as a second spelling of "no proxy headers".
    expect(stores.secrets.rows.has(WORP_EXTRA_HEADERS_SECRET)).toBe(false);
  });
});

describe("updateWorpSettings — rejections", () => {
  test("refuses a base URL that is not a URL", async () => {
    const err = await updateFailure({ baseUrl: "not a url" });
    expect(err._tag).toBe("InvalidWorpSettingsError");
    expect(err.reason).toBe("not_a_url");
    expect(settingWrites()).toEqual([]);
  });

  // A relay POSTs a body to this host; a non-HTTP scheme cannot carry one and
  // would be a way to point the relay somewhere it has no business going.
  test("refuses a non-HTTP base URL", async () => {
    const err = await updateFailure({ baseUrl: "file:///etc/passwd" });
    expect(err.reason).toBe("not_http");
    expect(settingWrites()).toEqual([]);
  });

  // The key was the one field with no minimum (#118), so a one-character paste
  // stored cleanly and `configured` — the gate that exists to catch exactly this
  // before a socket is opened — went true on a key that could only fail at worp.
  test("refuses a key too short to be one", async () => {
    const err = await updateFailure({ apiKey: "wk-x" });
    expect(err._tag).toBe("InvalidWorpSettingsError");
    expect(err.field).toBe("apiKey");
    expect(err.reason).toBe("too_short");
    expect(secretWrites(WORP_API_KEY_SECRET)).toEqual([]);
    expect(secretRemovals(WORP_API_KEY_SECRET)).toEqual([]);
  });

  test("a refused key leaves worp reporting itself unconfigured", async () => {
    stores = seed({ baseUrl: "https://worp.example.com" });
    await updateFailure({ apiKey: "wk-x" });
    const settings = await get();
    expect(settings.apiKey.configured).toBe(false);
    expect(settings.configured).toBe(false);
  });

  // A refused key must not take the rest of the patch down with it, in either
  // direction: the base URL beside it is not written either.
  test("refuses the whole patch when only the key is too short", async () => {
    await updateFailure({ baseUrl: "https://worp.example.com", apiKey: "wk-x" });
    expect(settingWrites()).toEqual([]);
    expect(stores.secrets.writes).toEqual([]);
  });

  test("a rejected key is not in the error", async () => {
    const short = "wk-x9";
    const err = await updateFailure({ apiKey: short });
    expect(JSON.stringify(err)).not.toContain(short);
    expect(String((err as unknown as Error).message)).not.toContain(short);
  });

  // A stored key that is long enough is unaffected — the check is on the paste,
  // not on what is already there.
  test("still accepts a key at the minimum length", async () => {
    const shortest = "wk-".padEnd(MIN_KEY_LENGTH, "9");
    const settings = await update({ apiKey: shortest });
    expect(secretWrites(WORP_API_KEY_SECRET)).toHaveLength(1);
    expect(settings.apiKey).toEqual({ configured: true, hint: maskCredential(shortest) });
  });

  test("refuses a header name that is not a valid HTTP token", async () => {
    const err = await updateFailure({ extraHeaders: { "Bad Header": "v" } });
    expect(err.reason).toBe("invalid_header_name");
    expect(err.header).toBe("Bad Header");
    expect(stores.secrets.writes).toEqual([]);
  });

  // miel sets Authorization itself; a stored entry claiming it would be an
  // attempt to swap out the credential worp authenticates the relay with.
  test("refuses a header miel sets itself, case-insensitively", async () => {
    const err = await updateFailure({ extraHeaders: { authorization: "Bearer x" } });
    expect(err.reason).toBe("reserved_header_name");
    expect(stores.secrets.writes).toEqual([]);
  });

  // The whole patch is refused, not the bad half — a save that half-applied
  // would leave worp pointing somewhere with headers that were never accepted.
  test("refuses the whole patch when one field is bad", async () => {
    const err = await updateFailure({
      baseUrl: "https://worp.example.com",
      extraHeaders: { "Bad Header": "v" },
    });
    expect(err._tag).toBe("InvalidWorpSettingsError");
    expect(settingWrites()).toEqual([]);
    expect(stores.secrets.writes).toEqual([]);
  });

  test("a rejection does not echo the header's value", async () => {
    const err = await updateFailure({ extraHeaders: { "Bad Header": CF_SECRET } });
    expect(JSON.stringify(err)).not.toContain(CF_SECRET);
  });
});

describe("updateWorpSettings — secrets stay out of the logs", () => {
  test("writes nothing containing the key or a header value to stderr", async () => {
    const written = await captureStderr(() =>
      update({
        baseUrl: "https://worp.example.com",
        apiKey: KEY,
        extraHeaders: { "CF-Access-Client-Secret": CF_SECRET },
      }),
    );
    expect(written).not.toContain(KEY);
    expect(written).not.toContain(CF_SECRET);
  });
});

// A patch that both stores take part in has to leave them agreeing, which the
// two-mock version of this suite could not see: each fake was its own truth.
describe("a patch across both stores", () => {
  test("lands in both and reads back as one configured relay", async () => {
    const settings = await update({
      baseUrl: "https://worp.example.com",
      apiKey: KEY,
      extraHeaders: { "CF-Access-Client-Id": "cf-id" },
    });

    expect(settings.configured).toBe(true);
    expect(stores.settings.rows.get(WORP_BASE_URL_SETTING)).toBe("https://worp.example.com");
    expect(stores.secrets.rows.has(WORP_API_KEY_SECRET)).toBe(true);
    expect(await get()).toEqual(settings);
  });
});
