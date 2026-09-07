/**
 * The canonical list of Google OAuth scopes miel requests.
 *
 * A leaf module on purpose: the public landing page derives its permission
 * disclosure table from this array (via the `@miel/core/googleScopes` subpath
 * export), and must be able to import it without pulling in
 * `google-auth-library` — or anything else — the way `oauthClient.ts` would.
 * Same shape as `appBasePath.ts`: one fact, no dependencies, several importers.
 *
 * Minimal scope set covering every Gmail operation miel performs:
 * - `gmail.modify`  → search, get, batchModify, thread trash/archive, label CRUD
 *                     (a superset of readonly + labels, so those aren't needed)
 * - `gmail.send`    → reply send
 * - `gmail.settings.basic` → filters list/create
 * - `userinfo.{profile,email}` → display name, avatar, canonical account email
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

export type GoogleScope = (typeof GOOGLE_SCOPES)[number];
