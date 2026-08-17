/**
 * How an operator produces the Google OAuth client miel signs into Gmail with.
 *
 * A leaf module for the same reason as `google/scopes.ts` and `claudeUsage.ts`:
 * three surfaces explain this — the README, the landing page's installation
 * guide and the onboarding gate's first step, which is the one a fresh install
 * actually hits — and the two that render import these steps instead of
 * restating them (#138). Console labels, the redirect URI and the consent
 * screen's mode are exactly the kind of fact that is copied once and then goes
 * stale in two places out of three.
 *
 * Plain text, no Markdown: the landing page renders its prose as HTML with no
 * Markdown pass and the dialog renders React text nodes, so a backtick here
 * reaches both readers as a backtick. The README dresses the same facts up in
 * its own file, which is the one place that may.
 */

/** The path the API serves the OAuth callback at — `googleOAuth.ts` mounts it. */
export const GOOGLE_OAUTH_CALLBACK_PATH = "/auth/google/callback";

/**
 * The redirect URI a local `bun dev` run needs registered: the API's default
 * port and the callback path above. It is `env.ts`'s default for
 * `GOOGLE_REDIRECT_URI` too, so what the documents tell a reader to register is
 * what an unconfigured server actually sends Google.
 */
export const DEV_GOOGLE_REDIRECT_URI = `http://localhost:3001${GOOGLE_OAUTH_CALLBACK_PATH}`;

/** The three variables the API reads at startup, in the order they are set. */
export const GOOGLE_OAUTH_ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
] as const;

export type GoogleOAuthSetupStep = {
  /** What the step accomplishes — a surface's list item, on its own line. */
  title: string;
  /** How to do it, and what goes wrong when it is skipped. */
  detail: string;
};

/**
 * The walkthrough, in the order the console makes an operator perform it: the
 * consent screen has to exist before a client can be created against it, and
 * the client has to exist before a redirect URI can be registered on it.
 *
 * Each step says what breaks when it is skipped, because every one of these
 * fails at Google rather than in miel — an unenabled Gmail API, an address that
 * is not a test user and a redirect URI off by a trailing slash all surface as
 * Google's own error page, which the app never sees and so cannot explain.
 */
export const GOOGLE_OAUTH_SETUP_STEPS: readonly GoogleOAuthSetupStep[] = [
  {
    title: "Create or select a Google Cloud project",
    detail:
      "Open the Google Cloud console at console.cloud.google.com and pick a project in the top bar, or create one. Everything below belongs to that project, and a throwaway project of your own is fine — this client is only ever used by your own deployment.",
  },
  {
    title: "Enable the Gmail API",
    detail:
      "In APIs & Services, open the Library, search for Gmail API and enable it on that project. Skipped, sign-in still succeeds and every mail request afterwards fails.",
  },
  {
    title: "Configure the OAuth consent screen",
    detail:
      "In APIs & Services, open the OAuth consent screen and choose the External user type. Leave it in Testing — personal use needs no verification review — and add every Gmail address you plan to connect as a test user, under Audience. An address that is not listed ends the consent flow in access_denied.",
  },
  {
    title: "Create an OAuth client ID of type Web application",
    detail:
      "In APIs & Services, open Credentials, choose Create credentials and then OAuth client ID, and set the application type to Web application. It is the only type with somewhere to register the callback URL below. The name is only shown on the consent screen.",
  },
  {
    title: "Register the redirect URI on that client",
    detail: `Add ${DEV_GOOGLE_REDIRECT_URI} under Authorized redirect URIs for a local run, and for a deployment the same ${GOOGLE_OAUTH_CALLBACK_PATH} path on the public origin the API is reached at. It must match GOOGLE_REDIRECT_URI byte for byte — scheme, host, path, no trailing slash — or Google refuses the sign-in with redirect_uri_mismatch before miel is reached at all.`,
  },
  {
    title: "Copy the client ID and secret into .env, then restart the API",
    detail:
      "Put the client id in GOOGLE_CLIENT_ID and the client secret in GOOGLE_CLIENT_SECRET in the .env file at the root of the deployment, and set GOOGLE_REDIRECT_URI to the URI you just registered. The three are read once at startup, so restart the API — the setup step clears itself on its next check.",
  },
];
