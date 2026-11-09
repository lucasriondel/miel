/**
 * The one script the public pages run: Umami, self-hosted at stats.gousse.cool,
 * counting visits without cookies.
 *
 * It is the single exception to "the built pages run no JavaScript". The
 * staticize step keeps a script whose `src` is exactly `ANALYTICS_SCRIPT_SRC`
 * and strips every other one, and the prerendered-output check accepts that tag
 * and nothing else — so this constant is the whole allowlist. The privacy
 * policy discloses it (`content/privacy.ts`). The app at `/app` carries no
 * tracker.
 */

/** The only script source the built pages may reference. */
export const ANALYTICS_SCRIPT_SRC = "https://stats.gousse.cool/script.js";

/** The miel.gousse.cool website in the Umami instance. */
export const UMAMI_WEBSITE_ID = "c5d95460-2c91-4bfb-b4cf-46b74e457ba5";

/** Umami ignores page views from any other host, such as a local preview. */
export const UMAMI_DOMAINS = "miel.gousse.cool";

/** The tag as the root route's `head()` declares it. */
export const ANALYTICS_SCRIPT = {
  src: ANALYTICS_SCRIPT_SRC,
  defer: true,
  "data-website-id": UMAMI_WEBSITE_ID,
  "data-domains": UMAMI_DOMAINS,
};
