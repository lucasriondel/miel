/**
 * The site's three pages, as one list.
 *
 * Kept apart from `site.ts` so the legal pages can name themselves — `site.ts`
 * would otherwise import them and they already import it. The footer renders
 * whichever entries are not the current page, which is what makes the homepage
 * link to both legal pages and each legal page link home and to the other.
 */
import { PRIVACY } from "./privacy";
import { TERMS } from "./terms";

export type NavEntry = { path: string; label: string };

export const HOME_PATH = "/";

export const NAV: readonly NavEntry[] = [
  { path: HOME_PATH, label: "Home" },
  { path: PRIVACY.path, label: PRIVACY.navLabel },
  { path: TERMS.path, label: TERMS.navLabel },
];

/** Every page except the one being rendered. */
export function otherPages(current: string): NavEntry[] {
  return NAV.filter((entry) => entry.path !== current);
}

/**
 * The homepage's pointer at the two legal pages, sitting under the Anthropic
 * disclosure — the moment a reader is most likely to want the detail — rather
 * than only in the footer. The link text itself comes from `NAV`.
 */
export const LEGAL_POINTER = {
  privacy: "What Miel stores, for how long, and how to have it deleted:",
  terms: "The terms it is offered under:",
} as const;
