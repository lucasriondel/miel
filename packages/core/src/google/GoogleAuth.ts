/**
 * `GoogleAuth` — the only service that touches the DB + OAuth2Client.
 *
 * `clientFor(ref)` loads the account's stored (encrypted) refresh token, builds
 * an `OAuth2Client`, and *forces* a fresh access token up front so every
 * downstream Gmail call sees a valid token and a revoked grant surfaces as a
 * `TokenRefreshError` at one well-known place. `consentUrl` / `exchangeCode`
 * drive the in-app "Connect with Google" flow. `profileFromToken` reads the
 * userinfo of a just-minted token during the callback (before a row exists).
 *
 * Mirrors worp `src/lib/services/GoogleAuth.ts`.
 */
import { Effect, Layer } from "effect";
import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { getDb } from "../db/client";
import { accounts } from "../db/schema";
import {
  AccountNotConnectedError,
  GmailApiError,
  OAuthConfigError,
  OAuthExchangeError,
  TokenRefreshError,
} from "../errors";
import { createDebug } from "../util/debug";
import { GOOGLE_SCOPES, makeOAuthClient, missingOAuthEnv, oauthEnv } from "./oauthClient";
import { decrypt } from "../util/crypto";
import {
  GoogleAuth,
  refKey,
  type AccountProfile,
  type AccountRef,
  type GoogleAuthImpl,
  type TokenGrant,
} from "./contracts";

const debug = createDebug("google:auth");

/** Load the account row (by id or email); null if it doesn't exist. */
function readAccount(ref: AccountRef) {
  const { db } = getDb();
  const where = "accountId" in ref ? eq(accounts.id, ref.accountId) : eq(accounts.email, ref.email);
  return Effect.promise(() =>
    db
      .select({
        id: accounts.id,
        email: accounts.email,
        refreshToken: accounts.refreshToken,
      })
      .from(accounts)
      .where(where)
      .limit(1)
      .then((rows) => rows[0] ?? null),
  );
}

const impl: GoogleAuthImpl = {
  clientFor: (ref) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      // A read failure is treated as a refresh failure: a row we can't read is
      // an account we can't authenticate with.
      const acct = yield* readAccount(ref).pipe(
        Effect.mapError((cause) => new TokenRefreshError({ ref: key, cause })),
      );
      if (!acct || !acct.refreshToken) {
        return yield* new AccountNotConnectedError({ ref: key });
      }
      const oauth = makeOAuthClient();
      oauth.setCredentials({ refresh_token: decrypt(acct.refreshToken) });
      // Force a fresh access token now (refreshes via the refresh token if
      // needed) so downstream Gmail calls never race a stale token, and a
      // revoked grant (invalid_grant) surfaces here as TokenRefreshError.
      yield* Effect.tryPromise({
        try: () => oauth.getAccessToken(),
        catch: (cause) => new TokenRefreshError({ ref: key, cause }),
      });
      debug.trace("clientFor ok", { ref: key });
      return oauth;
    }),

  consentUrl: (state) =>
    Effect.gen(function* () {
      const missing = missingOAuthEnv();
      if (missing.length > 0) {
        return yield* new OAuthConfigError({ missing });
      }
      const oauth = makeOAuthClient();
      const url = oauth.generateAuthUrl({
        access_type: "offline",
        prompt: "consent", // guarantee a refresh_token every consent
        scope: [...GOOGLE_SCOPES],
        state,
      });
      debug("consentUrl", { state });
      return url;
    }),

  exchangeCode: (code) =>
    Effect.gen(function* () {
      const missing = missingOAuthEnv();
      if (missing.length > 0) {
        return yield* new OAuthConfigError({ missing });
      }
      const oauth = makeOAuthClient();
      const tokens = yield* Effect.tryPromise({
        try: () => oauth.getToken(code).then((r) => r.tokens),
        catch: (cause) => new OAuthExchangeError({ cause }),
      });
      if (!tokens.refresh_token) {
        return yield* new OAuthExchangeError({
          cause: new Error("no refresh_token in token response"),
        });
      }
      const grant: TokenGrant = {
        refreshToken: tokens.refresh_token,
        scopes: typeof tokens.scope === "string" ? tokens.scope.split(" ") : [],
        accessToken: tokens.access_token ?? "",
      };
      debug("exchangeCode ok", { scopes: grant.scopes.length });
      return grant;
    }),

  profileFromToken: (accessToken) =>
    Effect.gen(function* () {
      const oauth = makeOAuthClient(oauthEnv());
      oauth.setCredentials({ access_token: accessToken });
      const info = yield* Effect.tryPromise({
        try: () => google.oauth2({ version: "v2", auth: oauth }).userinfo.get(),
        catch: (cause) => new GmailApiError({ op: "userinfo.get", cause }),
      });
      const profile: AccountProfile = {
        email: info.data.email ?? "",
        displayName: info.data.name ?? null,
        avatarUrl: info.data.picture ?? null,
      };
      debug("profileFromToken", { email: profile.email });
      return profile;
    }),
};

export const GoogleAuthLive = Layer.succeed(GoogleAuth, impl);
