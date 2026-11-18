import {
  GOOGLE_OAUTH_CALLBACK_PATH,
  GOOGLE_OAUTH_SETUP_STEPS,
  type GoogleOAuthSetupStep,
} from "@miel/core/googleOAuthSetup";

/**
 * The redirect URI this page would expect Google to send the browser back to:
 * the API's callback path on the API address the app was built with, resolved
 * against this page's origin — `<server URL>/api/auth/google/callback` for the
 * same-origin deployment. A suggestion for a server with no client yet; once
 * one is in effect, its own redirect URI is what the form starts from
 * (`defaultRedirectUri`).
 */
export function suggestedRedirectUri(apiBase: string, origin: string): string {
  return new URL(`${apiBase}${GOOGLE_OAUTH_CALLBACK_PATH}`, origin).href;
}

/**
 * The text "Copy prompt" puts on the clipboard: a request an AI assistant can
 * walk the reader through, built from the same steps the README and the public
 * guide render (`@miel/core/googleOAuthSetup`) so the three cannot disagree.
 */
export function googleSetupPrompt(
  redirectUri: string,
  steps: readonly GoogleOAuthSetupStep[] = GOOGLE_OAUTH_SETUP_STEPS,
): string {
  const lines = steps.map((step, i) => `${i + 1}. ${step.title}. ${step.detail}`);
  return [
    "I'm self-hosting miel, a Gmail triage app. Walk me through creating its Google OAuth client, one step at a time:",
    "",
    ...lines,
    "",
    `The redirect URI I expect to register is ${redirectUri}.`,
  ].join("\n");
}
