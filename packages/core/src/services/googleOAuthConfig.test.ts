// The Google OAuth client entered in the app: stored client first, environment
// as the fallback, never mixed, and the warning that a different client
// disconnects every mailbox.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { expectFailureTag, runExit } from "../testkit/runExit";
import { makeTestStores, type TestStores } from "../testkit/stores";
import {
  GOOGLE_CLIENT_SECRET_SECRET,
  clearGoogleOAuthConfigEffect,
  getGoogleOAuthStatusEffect,
  redirectUriProblem,
  resolveGoogleOAuthConfigEffect,
  saveGoogleOAuthConfigEffect,
} from "./googleOAuthConfig";

const VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"] as const;
const saved = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));

const ENV_CLIENT = {
  GOOGLE_CLIENT_ID: "env-client.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "env-secret-value",
  GOOGLE_REDIRECT_URI: "http://localhost:5531/auth/google/callback",
};

const setEnv = (values: Partial<Record<(typeof VARS)[number], string>>) => {
  for (const k of VARS) {
    if (values[k] === undefined) delete process.env[k];
    else process.env[k] = values[k];
  }
};

let stores: TestStores;

beforeEach(() => {
  stores = makeTestStores({
    mailbox: {
      accounts: [
        { id: "a1", email: "one@example.com" },
        { id: "a2", email: "two@example.com" },
      ],
    },
  });
});

afterEach(() => {
  for (const k of VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const SAVE = {
  clientId: "app-client.apps.googleusercontent.com",
  clientSecret: "app-secret-value",
  redirectUri: "https://miel.example.com/api/auth/google/callback",
};

describe("which client is in effect", () => {
  test("the environment's, when nothing is stored", async () => {
    setEnv(ENV_CLIENT);
    const status = await stores.run(getGoogleOAuthStatusEffect());
    expect(status).toMatchObject({
      configured: true,
      missing: [],
      source: "environment",
      clientId: ENV_CLIENT.GOOGLE_CLIENT_ID,
      secretHint: null,
      accountsToReconnect: 2,
    });
  });

  test("the stored one, all three fields of it, once saved — whatever the environment says", async () => {
    setEnv(ENV_CLIENT);
    await stores.run(saveGoogleOAuthConfigEffect(SAVE));
    const resolved = await stores.run(resolveGoogleOAuthConfigEffect());
    expect(resolved).toEqual({ ...SAVE, source: "database" });
  });

  test("nothing at all is reported as unconfigured with no source", async () => {
    setEnv({});
    const status = await stores.run(getGoogleOAuthStatusEffect());
    expect(status).toMatchObject({ configured: false, source: null, clientId: null });
    expect(status.missing).toEqual([...VARS]);
  });
});

describe("saving a client", () => {
  test("stores the secret as a secret and answers only a hint of it", async () => {
    setEnv({});
    const result = await stores.run(saveGoogleOAuthConfigEffect(SAVE));
    expect(result).toMatchObject({ configured: true, source: "database", clientChanged: false });
    expect(result.secretHint).not.toBe(SAVE.clientSecret);
    expect(JSON.stringify(result)).not.toContain(SAVE.clientSecret);
    // Through the one encrypting writer, under the secret's own name.
    expect(stores.secrets.writes.map((w) => w.name)).toEqual([GOOGLE_CLIENT_SECRET_SECRET]);
  });

  test("a different client than the one in effect says every account must reconnect", async () => {
    setEnv(ENV_CLIENT);
    const result = await stores.run(saveGoogleOAuthConfigEffect(SAVE));
    expect(result).toMatchObject({ clientChanged: true, reconnectRequired: 2 });
  });

  test("the same client again, or only a new redirect URI, keeps every account", async () => {
    setEnv({});
    await stores.run(saveGoogleOAuthConfigEffect(SAVE));
    const again = await stores.run(
      saveGoogleOAuthConfigEffect({
        clientId: SAVE.clientId,
        redirectUri: "http://localhost:5531/auth/google/callback",
      }),
    );
    // No secret named: the stored one is kept.
    expect(again).toMatchObject({ clientChanged: false, reconnectRequired: 0 });
    expect((await stores.run(resolveGoogleOAuthConfigEffect())).clientSecret).toBe(
      SAVE.clientSecret,
    );
  });

  test("refuses a redirect URI that is not the callback, and writes nothing", async () => {
    setEnv({});
    const exit = await runExit(
      stores.provide(
        saveGoogleOAuthConfigEffect({ ...SAVE, redirectUri: "https://miel.example.com/callback" }),
      ),
    );
    expectFailureTag(exit, "InvalidGoogleOAuthConfigError");
    expect(stores.settings.writes).toEqual([]);
    expect(stores.secrets.writes).toEqual([]);
  });

  test("a first save with no secret is refused", async () => {
    setEnv(ENV_CLIENT);
    const exit = await runExit(
      stores.provide(
        saveGoogleOAuthConfigEffect({ clientId: SAVE.clientId, redirectUri: SAVE.redirectUri }),
      ),
    );
    expectFailureTag(exit, "InvalidGoogleOAuthConfigError");
  });

  test("clearing it falls back to the environment, and says so when that is another client", async () => {
    setEnv(ENV_CLIENT);
    await stores.run(saveGoogleOAuthConfigEffect(SAVE));
    const cleared = await stores.run(clearGoogleOAuthConfigEffect());
    expect(cleared).toMatchObject({
      source: "environment",
      clientId: ENV_CLIENT.GOOGLE_CLIENT_ID,
      clientChanged: true,
      reconnectRequired: 2,
    });
  });
});

describe("redirectUriProblem", () => {
  test("wants an http(s) URL ending in the callback path, with no query", () => {
    expect(redirectUriProblem("https://x.test/api/auth/google/callback")).toBeNull();
    expect(redirectUriProblem("http://localhost:5531/auth/google/callback")).toBeNull();
    expect(redirectUriProblem("https://x.test/api/auth/google/callback/")).toBe(
      "wrong_callback_path",
    );
    expect(redirectUriProblem("https://x.test/auth/google/callback?x=1")).toBe("invalid");
    expect(redirectUriProblem("not a url")).toBe("invalid");
    expect(redirectUriProblem("ftp://x.test/auth/google/callback")).toBe("invalid");
  });
});
