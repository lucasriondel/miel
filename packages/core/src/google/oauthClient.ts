/**
 * OAuth2 client construction + scopes.
 *
 * Reads the three Google OAuth env vars at use-time (so each environment — dev
 * vs. the Dokploy VPS — supplies its own redirect URI) and builds a token-less
 * `OAuth2Client`. Reused by `GoogleAuth` for the consent URL, the code
 * exchange, and per-account authed clients. Mirrors worp `GoogleAuth.ts:14-32`.
 */
import { OAuth2Client } from "google-auth-library";

/**
 * The scope list lives in `./scopes`, a leaf module the landing page can import
 * without dragging `google-auth-library` in with it. Re-exported here so every
 * existing `from "./oauthClient"` import keeps working.
 */
export { GOOGLE_SCOPES, type GoogleScope } from "./scopes";

export interface OAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Read the three required OAuth env vars at use-time. */
export function oauthEnv(): OAuthEnv {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  };
}

/** Which required env vars are absent (drives OAuthConfigError). */
export function missingOAuthEnv(env: OAuthEnv = oauthEnv()): string[] {
  const missing: string[] = [];
  if (!env.clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!env.clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!env.redirectUri) missing.push("GOOGLE_REDIRECT_URI");
  return missing;
}

/**
 * What the app is told about the server's Google OAuth configuration.
 *
 * Names only, never values: the client secret is a secret, and the client id and
 * redirect URI are of no use to a UI that can only report that they are absent.
 * `missing` is empty exactly when `configured` is true — both are on the shape
 * so a caller can render "which ones" without recomputing the verdict.
 */
export interface GoogleOAuthConfigStatus {
  configured: boolean;
  missing: string[];
}

/**
 * Whether the server can start an OAuth flow at all (#120).
 *
 * The three variables are read at use-time everywhere else, so an install that
 * is missing one only finds out when someone presses "Connect with Google" and
 * gets an `OAuthConfigError` from the consent-URL call. This is the same
 * question asked up front, so the first-run gate can say which variable to set
 * instead of leaving a dead button.
 */
export function googleOAuthConfigStatus(env: OAuthEnv = oauthEnv()): GoogleOAuthConfigStatus {
  const missing = missingOAuthEnv(env);
  return { configured: missing.length === 0, missing };
}

/** A token-less OAuth2 client from env — for consent URL + code exchange. */
export function makeOAuthClient(env: OAuthEnv = oauthEnv()): OAuth2Client {
  return new OAuth2Client({
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    redirectUri: env.redirectUri,
  });
}
