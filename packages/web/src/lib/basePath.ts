/**
 * The path prefix the app is served under (`APP_BASE_PATH` in core, wired into
 * Vite as `base`). Vite bakes it into the bundle as `import.meta.env.BASE_URL`,
 * always with a trailing slash.
 *
 * Vite rewrites the asset URLs it can see — module imports and the attributes
 * in `index.html` — but not string literals in components, so anything pointing
 * at a file in `public/` has to go through `assetUrl`.
 */

// Read once. Undefined outside a Vite build (e.g. under `bun test`), where the
// root base is the sane reading.
const BASE_URL = import.meta.env.BASE_URL ?? "/";

/** React Router's `basename` for a Vite `BASE_URL`. */
export function basenameFor(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** Puts a `public/` path under a base, without doubling the separator. */
export function joinBase(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

/** The router's `basename` for this build. */
export const appBasename = basenameFor(BASE_URL);

/** URL of a file served from `public/`, prefixed with the app's base. */
export function assetUrl(path: string): string {
  return joinBase(BASE_URL, path);
}
