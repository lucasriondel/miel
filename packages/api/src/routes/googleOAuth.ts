/**
 * In-app Google OAuth ("Connect with Google").
 *
 * `GET /auth/google/start` (bearer-protected; called by the web) returns a
 * consent URL with a random `state` we remember briefly for CSRF. The browser
 * is sent to Google, which redirects back to `GET /auth/google/callback`
 * (mounted publicly in app.ts — Google can't send a bearer token). The callback
 * verifies `state`, exchanges the code for a refresh token, reads the profile,
 * upserts the account, and returns the browser into the app (under the `/app`
 * base path).
 *
 * There are two entry points — the settings page and the first-run onboarding
 * gate — and the landing page follows the origin: settings goes back to
 * settings, the gate goes to the inbox of the account just connected. Since the
 * callback runs outside the SPA, the origin rides along with the server-side
 * flow state (`./connectState`) rather than the callback URL, and it is one of
 * a closed set of in-app targets, so nothing the browser sends back can steer
 * the redirect (see `connectReturnUrl` in core).
 */
import { Hono } from "hono";
import {
  DEFAULT_CONNECT_RETURN_TARGET,
  GOOGLE_OAUTH_CALLBACK_PATH,
  GoogleAuth,
  connectAccount,
  connectReturnUrl,
  exchangeCodeAndProfile,
  getEnv,
  googleOAuthConfigStatus,
  parseConnectReturnTarget,
  runWithGoogleAuth,
} from "@miel/core";
import type { ConnectOutcome } from "@miel/core";
import { createConnectStateStore } from "./connectState";

const connectStates = createConnectStateStore();

export const googleOAuthStartRoutes = new Hono();

// Whether this server has the three GOOGLE_* variables the flow below needs
// (#120). Answers with names, never values — the client secret is one, and the
// other two tell a UI nothing it can act on beyond "set this". Read at
// use-time like every other read of them, so a restart with the variables
// supplied is reflected without a code change.
googleOAuthStartRoutes.get("/google/config", (c) => c.json(googleOAuthConfigStatus()));

// Bearer-protected: the web calls this and opens the returned URL.
googleOAuthStartRoutes.get("/google/start", async (c) => {
  // `return` names where the flow started; it is narrowed to a known target
  // here and kept server-side — the consent URL carries only the opaque state.
  const target = parseConnectReturnTarget(c.req.query("return"));
  const state = connectStates.issue(target);
  const url = await runWithGoogleAuth(GoogleAuth.consentUrl(state));
  return c.json({ url });
});

/** Public callback router — mounted before bearerAuth in app.ts. */
export const googleOAuthCallbackRoutes = new Hono();

// The path the setup walkthrough tells an operator to register (#138), taken
// from the constant it reads from rather than written out a second time here.
googleOAuthCallbackRoutes.get(GOOGLE_OAUTH_CALLBACK_PATH, async (c) => {
  const { WEB_ORIGIN } = getEnv();
  const code = c.req.query("code");
  const oauthError = c.req.query("error");

  // Burn the state first: it is both the CSRF check and the only record of
  // where this flow began. A callback we can't match still has to land
  // somewhere, hence the default target.
  const flow = connectStates.consume(c.req.query("state"));
  const target = flow?.target ?? DEFAULT_CONNECT_RETURN_TARGET;
  const back = (outcome: Omit<ConnectOutcome, "target">) =>
    // WEB_ORIGIN is the bare scheme://host (it doubles as the CORS allowlist
    // entry); the app itself is served under /app, so the landing spot needs
    // the prefix or the browser comes back to a path nginx no longer serves.
    c.redirect(connectReturnUrl(WEB_ORIGIN, { target, ...outcome }));

  if (oauthError) return back({ error: oauthError });
  if (!code || !flow) return back({ error: "state" });

  try {
    // Exchange code → tokens, then read the profile from the fresh access token.
    const { grant, profile } = await exchangeCodeAndProfile(code);
    const account = await connectAccount({
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      refreshToken: grant.refreshToken,
      scopes: grant.scopes,
    });
    return back({ accountId: account.id, connected: account.email });
  } catch {
    return back({ error: "exchange" });
  }
});
