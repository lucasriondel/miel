/**
 * How one hostname is split across two containers.
 *
 * The public pages ship as their own nginx image (`Dockerfile` beside this
 * package's `package.json`) instead of being copied into the app's image: a
 * self-hoster builds the app, not the owner's marketing site, so the app image
 * carries no landing-page content. The domain is therefore path-routed at the
 * reverse proxy in front of both containers:
 *
 *   <site host>/       -> miel-landing (nginx, the prerendered pages)
 *   <site host>/app/*  -> miel-web     (the SPA)
 *   <site host>/api/*  -> miel-web     -> miel-api
 *
 * This module is the one place those prefixes are written down as data. It is
 * not runtime code — nothing here is imported by a page — but the split has two
 * properties worth failing a test over rather than discovering in production:
 * the app's prefix is the same constant its Vite base and router basename come
 * from, and the Cloudflare Access boundary covers exactly the paths the web
 * container answers, so no landing page can end up behind a login prompt.
 *
 * The reverse-proxy rules and the Access policies themselves are dashboard
 * configuration (see DEPLOY.md); this states what that configuration has to say.
 */
import { APP_BASE_PATH } from "@miel/core/appBasePath";

/**
 * The host of the reference deployment DEPLOY.md walks through, and the value
 * `SITE_HOST` falls back to — so that deployment keeps resolving to the same
 * name without setting anything.
 */
export const DEFAULT_SITE_HOST = "miel.gousse.cool";

/**
 * The single host both containers are reached through, read from the
 * environment so self-hosting means setting `SITE_HOST`, not editing this file.
 * Blank is the same as unset: an env var declared and left empty in a dashboard
 * is a common enough shape that it should not resolve to an empty hostname.
 */
export function resolveSiteHost(env: Record<string, string | undefined> = process.env): string {
  return env.SITE_HOST?.trim() || DEFAULT_SITE_HOST;
}

export const SITE_HOST = resolveSiteHost();

export const LANDING_CONTAINER = "miel-landing";
export const WEB_CONTAINER = "miel-web";

export type Backend = typeof LANDING_CONTAINER | typeof WEB_CONTAINER;

/**
 * Where the browser reaches the API. Outside `APP_BASE_PATH` on purpose, and on
 * the same host as the app: the bundle calls `/api` same-origin, and nginx
 * inside the web container proxies it on to the API. A cross-origin arrangement
 * failed here before — Cloudflare Access rejected the credential-less preflight
 * with no CORS headers.
 */
export const API_PROXY_PATH = "/api";

export type PathRoute = { prefix: string; backend: Backend };

/**
 * Most specific first. Traefik orders routers by rule length, so the two app
 * prefixes outrank the site root on their own, but the order is stated here
 * rather than relied upon: `backendForPath` takes the first match.
 */
export const PATH_ROUTES: readonly PathRoute[] = [
  { prefix: APP_BASE_PATH, backend: WEB_CONTAINER },
  { prefix: API_PROXY_PATH, backend: WEB_CONTAINER },
  { prefix: "/", backend: LANDING_CONTAINER },
];

/**
 * Whether a path sits under a prefix, counting whole segments only — `/app`
 * covers `/app` and `/app/settings` but not `/appointments`.
 */
function underPrefix(path: string, prefix: string): boolean {
  if (prefix === "/") return path.startsWith("/");
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Which container answers a request for `path`. */
export function backendForPath(path: string): Backend {
  const route = PATH_ROUTES.find((candidate) => underPrefix(path, candidate.prefix));
  if (!route) throw new Error(`no backend routes ${path}`);
  return route.backend;
}

/**
 * The prefixes Cloudflare Access gates once the owner narrows the policies from
 * the whole host. Everything else on the host is public, which is what makes the
 * landing pages readable — and why they reference no subresource of their own.
 */
export const GATED_PREFIXES: readonly string[] = PATH_ROUTES.filter(
  (route) => route.backend === WEB_CONTAINER,
).map((route) => route.prefix);

/** Whether a visitor requesting `path` is challenged to log in. */
export function isGated(path: string): boolean {
  return GATED_PREFIXES.some((prefix) => underPrefix(path, prefix));
}
