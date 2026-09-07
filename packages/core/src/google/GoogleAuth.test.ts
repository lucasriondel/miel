import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Effect } from "effect";
import { runExit, expectFailureTag, expectSuccess } from "../testkit/runExit";
import { GoogleAuth } from "./contracts";

// ── db/client mock ───────────────────────────────────────────────────────────
// readAccount() does db.select({...}).from(accounts).where(...).limit(1).then(
// rows => rows[0] ?? null), so .limit() must resolve to the rows array. Each
// test sets the row (or null) the query "returns".
let accountRow: unknown = null;

mock.module("../db/client", () => ({
  getDb: () => ({
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            // limit() returns the awaited rows; null row → empty result set.
            limit: () => Promise.resolve(accountRow === null ? [] : [accountRow]),
          }),
        }),
      }),
    },
  }),
  // The fake replaces the module for every file loaded after this one, so it has
  // to carry the exports this suite never calls: a later file importing the
  // barrel (which re-exports them) would otherwise die on "export not found".
  closeDb: async () => {},
}));

// ── google-auth-library mock ─────────────────────────────────────────────────
// oauthClient.ts does `new OAuth2Client({...})`, so this must be a constructor.
// Each test wires the per-method behaviour the live impl exercises.
let getAccessTokenImpl: () => Promise<unknown>;
let getTokenImpl: () => Promise<{ tokens: Record<string, unknown> }>;

class FakeOAuth2Client {
  setCredentials(_creds: unknown): void {}
  generateAuthUrl(_opts: unknown): string {
    return "https://accounts.google.com/o/oauth2/auth?fake=1";
  }
  getAccessToken(): Promise<unknown> {
    return getAccessTokenImpl();
  }
  getToken(_code: string): Promise<{ tokens: Record<string, unknown> }> {
    return getTokenImpl();
  }
}

mock.module("google-auth-library", () => ({
  OAuth2Client: FakeOAuth2Client,
}));

// ── googleapis mock ──────────────────────────────────────────────────────────
// Only profileFromToken touches this; kept inert so an import never hits network.
mock.module("googleapis", () => ({
  google: {
    oauth2: () => ({ userinfo: { get: async () => ({ data: {} }) } }),
  },
}));

// Import the live layer AFTER the mocks are registered.
const { GoogleAuthLive } = await import("./GoogleAuth");

const run = <A, E>(eff: Effect.Effect<A, E, GoogleAuth>) =>
  runExit(Effect.provide(eff, GoogleAuthLive));

// Required OAuth env for the consent/exchange happy paths.
function setOAuthEnv(): void {
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost/cb";
}

function clearOAuthEnv(): void {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REDIRECT_URI;
}

describe("GoogleAuth", () => {
  beforeEach(() => {
    accountRow = null;
    getAccessTokenImpl = async () => ({ token: "fresh-access" });
    getTokenImpl = async () => ({
      tokens: {
        refresh_token: "r-token",
        access_token: "a-token",
        scope: "scope.a scope.b",
      },
    });
    setOAuthEnv();
  });

  test("clientFor with no row fails with AccountNotConnectedError", async () => {
    accountRow = null;
    const exit = await run(Effect.flatMap(GoogleAuth, (s) => s.clientFor({ email: "a@b.c" })));
    expectFailureTag(exit, "AccountNotConnectedError");
  });

  test("clientFor maps an invalid_grant refresh to TokenRefreshError", async () => {
    // Stored token is plaintext-prefixed so decrypt() returns "secret" keyless.
    accountRow = { id: "1", email: "a@b.c", refreshToken: "plain:secret" };
    getAccessTokenImpl = async () => {
      throw { error: "invalid_grant" };
    };
    const exit = await run(Effect.flatMap(GoogleAuth, (s) => s.clientFor({ email: "a@b.c" })));
    expectFailureTag(exit, "TokenRefreshError");
  });

  test("clientFor success returns the OAuth2Client", async () => {
    accountRow = { id: "1", email: "a@b.c", refreshToken: "plain:secret" };
    const exit = await run(Effect.flatMap(GoogleAuth, (s) => s.clientFor({ email: "a@b.c" })));
    const client = expectSuccess(exit);
    expect(client).toBeInstanceOf(FakeOAuth2Client);
  });

  test("consentUrl fails with OAuthConfigError when env is missing", async () => {
    clearOAuthEnv();
    const exit = await run(Effect.flatMap(GoogleAuth, (s) => s.consentUrl("state-123")));
    expectFailureTag(exit, "OAuthConfigError");
  });

  test("consentUrl returns a url when env is present", async () => {
    const exit = await run(Effect.flatMap(GoogleAuth, (s) => s.consentUrl("state-123")));
    const url = expectSuccess(exit);
    expect(typeof url).toBe("string");
    expect(url).toContain("https://");
  });

  test("exchangeCode success returns refresh token, scopes and access token", async () => {
    const exit = await run(Effect.flatMap(GoogleAuth, (s) => s.exchangeCode("auth-code")));
    const grant = expectSuccess(exit);
    expect(grant).toEqual({
      refreshToken: "r-token",
      scopes: ["scope.a", "scope.b"],
      accessToken: "a-token",
    });
  });

  test("exchangeCode without a refresh_token fails with OAuthExchangeError", async () => {
    getTokenImpl = async () => ({
      tokens: { access_token: "a-token", scope: "scope.a" },
    });
    const exit = await run(Effect.flatMap(GoogleAuth, (s) => s.exchangeCode("auth-code")));
    expectFailureTag(exit, "OAuthExchangeError");
  });
});
