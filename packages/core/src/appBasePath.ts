/**
 * Where the web app lives on the deployed host.
 *
 * The site root is reserved for the public landing pages, so the SPA is served
 * under a path prefix instead. Three places have to agree on it: the Vite build
 * (`base`, so emitted asset URLs carry the prefix), the browser router
 * (`basename`, so client-side routes resolve under it), and nginx (the
 * single-page fallback). Two of those import this module; the nginx template
 * repeats the literal because it isn't JavaScript.
 *
 * The `/api` proxy path is deliberately NOT under this prefix — the app must
 * keep calling its API same-origin at `/api`, or Cloudflare Access rejects the
 * resulting preflight with no CORS headers.
 */
export const APP_BASE_PATH = "/app";

/** The prefix as Vite wants it (`base`), i.e. with a trailing slash. */
export const APP_BASE_URL = `${APP_BASE_PATH}/`;

/**
 * Absolute URL of a page inside the app, e.g. the OAuth callback's landing
 * spot. `origin` is the bare scheme://host (`WEB_ORIGIN`), which doubles as the
 * API's CORS allowlist entry and so must not itself carry the prefix.
 */
export function webAppUrl(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${APP_BASE_PATH}${suffix}`;
}
