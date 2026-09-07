/**
 * The Google permission disclosure, derived from the canonical scope list.
 *
 * The scope strings are not restated here: `GOOGLE_SCOPES` is imported from
 * `@miel/core`, so the rows on the public page are generated from exactly what
 * the app asks for at consent. Adding a scope without documenting it, or
 * documenting one the app no longer requests, fails `scopes.test.ts`.
 *
 * `consentWording` reproduces Google's own consent-screen description verbatim
 * — including "permanently delete" on the mail-modify scope. Miel never
 * permanently deletes anything (trash is a label move), but that is the
 * sentence the reader will see at consent, and softening it here would read as
 * evasive when they got there.
 */
import { GOOGLE_SCOPES } from "@miel/core/googleScopes";

export type ScopeDisclosure = {
  /** The scope string, straight from the canonical list. */
  scope: string;
  /** Short name for the permission — the table's row header. */
  permission: string;
  /** Google's consent-screen wording, unsoftened. */
  consentWording: string;
  /** The miel feature that requires it. */
  feature: string;
};

type Copy = Omit<ScopeDisclosure, "scope">;

const COPY: Record<string, Copy> = {
  "https://www.googleapis.com/auth/gmail.modify": {
    permission: "Gmail modify",
    consentWording: "Read, compose, send, and permanently delete all your email from Gmail",
    feature:
      "Fetch messages for triage; apply and remove labels; archive or trash the threads you select.",
  },
  "https://www.googleapis.com/auth/gmail.send": {
    permission: "Gmail send",
    consentWording: "Send email on your behalf",
    feature:
      "Send the replies you have reviewed and approved. Nothing is sent without you pressing send.",
  },
  "https://www.googleapis.com/auth/gmail.settings.basic": {
    permission: "Gmail basic settings",
    consentWording: "See, edit, create, or change your email settings and filters in Gmail",
    feature: "List your Gmail filters, and create the ones you accept from Miel's suggestions.",
  },
  "https://www.googleapis.com/auth/userinfo.profile": {
    permission: "User info: profile",
    consentWording:
      "See your personal info, including any personal info you've made publicly available",
    feature: "Show the connected account's display name and avatar in the app.",
  },
  "https://www.googleapis.com/auth/userinfo.email": {
    permission: "User info: email",
    consentWording: "See your primary Google Account email address",
    feature: "Identify which account is connected.",
  },
};

/** One row per requested scope, in the order the consent screen lists them. */
export const SCOPE_DISCLOSURES: readonly ScopeDisclosure[] = GOOGLE_SCOPES.flatMap((scope) => {
  const copy = COPY[scope];
  return copy ? [{ scope, ...copy }] : [];
});

/** Scopes this module carries copy for, requested or not. */
export function documentedScopes(): string[] {
  return Object.keys(COPY);
}

/** Requested by the app but missing from the page — an undisclosed permission. */
export function undocumentedScopes(): string[] {
  return GOOGLE_SCOPES.filter((scope) => !COPY[scope]);
}

/** On the page but no longer requested — access the page over-advertises. */
export function staleDisclosures(): string[] {
  const requested = new Set<string>(GOOGLE_SCOPES);
  return documentedScopes().filter((scope) => !requested.has(scope));
}

/** Every string in the table, joined — the seam the copy tests assert on. */
export function allScopeText(): string {
  return SCOPE_DISCLOSURES.flatMap((row) => [row.permission, row.consentWording, row.feature]).join(
    "\n",
  );
}
