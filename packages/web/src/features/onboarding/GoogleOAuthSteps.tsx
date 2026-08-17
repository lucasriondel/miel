import { GOOGLE_OAUTH_SETUP_STEPS } from "@miel/core/googleOAuthSetup";

/**
 * The walkthrough that produces the Google OAuth client this server is missing
 * (#138), rendered as the ordered list it is.
 *
 * The steps come from `@miel/core/googleOAuthSetup`, which the README and the
 * public installation guide also read: the console's own labels, the redirect
 * URI and the consent screen's mode are exactly the facts that get copied into
 * three documents and then corrected in one. Nothing here is written twice —
 * this file decides how they look, not what they say.
 *
 * The list is named so the dialog's other list, the missing variables above it,
 * stays distinguishable to a screen reader.
 */
export const GoogleOAuthSteps = () => (
  <ol
    aria-label="Creating a Google OAuth client"
    className="flex list-decimal flex-col gap-3 pl-5 text-left marker:font-semibold marker:text-gousse-muted"
  >
    {GOOGLE_OAUTH_SETUP_STEPS.map((step) => (
      <li key={step.title} className="pl-1">
        <span className="text-sm font-semibold text-gousse-ink">{step.title}</span>
        <span className="mt-0.5 block text-xs font-medium leading-relaxed text-gousse-muted">
          {step.detail}
        </span>
      </li>
    ))}
  </ol>
);
