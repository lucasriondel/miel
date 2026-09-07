import { describe, expect, test } from "bun:test";
import { APP_BASE_PATH } from "@miel/core/appBasePath";
import { PAGE_CONTRACTS } from "../build/verifyPrerendered";
import { NAV } from "../content/nav";
import {
  API_PROXY_PATH,
  backendForPath,
  DEFAULT_SITE_HOST,
  GATED_PREFIXES,
  isGated,
  LANDING_CONTAINER,
  PATH_ROUTES,
  resolveSiteHost,
  SITE_HOST,
  WEB_CONTAINER,
} from "./topology";

describe("path routing across the two containers", () => {
  test("the site root and the legal pages are answered by the landing container", () => {
    for (const path of ["/", "/privacy", "/privacy/", "/terms", "/favicon.ico"]) {
      expect(backendForPath(path)).toBe(LANDING_CONTAINER);
    }
  });

  test("the app and its same-origin API proxy are answered by the web container", () => {
    for (const path of ["/app", "/app/", "/app/settings", "/api/health", "/api/sync/ws"]) {
      expect(backendForPath(path)).toBe(WEB_CONTAINER);
    }
  });

  test("a prefix matches whole path segments, not any path that starts with the letters", () => {
    expect(backendForPath("/appointments")).toBe(LANDING_CONTAINER);
    expect(backendForPath("/apiary")).toBe(LANDING_CONTAINER);
  });

  test("every prerendered page is served by the landing container", () => {
    for (const contract of PAGE_CONTRACTS) {
      expect(backendForPath(contract.route)).toBe(LANDING_CONTAINER);
    }
  });

  test("the app prefix is the one the app's own build and router use", () => {
    expect(PATH_ROUTES.some((route) => route.prefix === APP_BASE_PATH)).toBe(true);
  });

  /**
   * Load-bearing: the app must keep calling its API on the same host and outside
   * the app prefix. A cross-origin call would trigger a preflight Cloudflare
   * Access rejects with no CORS headers, and moving /api under /app would mean
   * rewriting the API base the bundle is built with.
   */
  test("the API proxy stays on the same host and outside the app prefix", () => {
    expect(API_PROXY_PATH.startsWith(`${APP_BASE_PATH}/`)).toBe(false);
    expect(backendForPath(API_PROXY_PATH)).toBe(backendForPath(APP_BASE_PATH));
  });

  test("the two containers share one host, so nothing here is cross-origin", () => {
    expect(SITE_HOST).toBe(resolveSiteHost(process.env));
  });
});

/**
 * Issue #99: a self-hoster configures the host, they don't fork the file that
 * names it. The default is the reference deployment's host, so the deployment
 * DEPLOY.md describes is unaffected by the indirection.
 */
describe("where the host comes from", () => {
  test("falls back to the reference deployment's host when nothing is set", () => {
    expect(resolveSiteHost({})).toBe(DEFAULT_SITE_HOST);
  });

  test("takes SITE_HOST from the environment", () => {
    expect(resolveSiteHost({ SITE_HOST: "miel.example.org" })).toBe("miel.example.org");
  });

  test("treats a blank SITE_HOST as unset rather than as an empty hostname", () => {
    expect(resolveSiteHost({ SITE_HOST: "   " })).toBe(DEFAULT_SITE_HOST);
  });

  test("trims a value pasted with surrounding whitespace", () => {
    expect(resolveSiteHost({ SITE_HOST: " miel.example.org\n" })).toBe("miel.example.org");
  });

  test("the root route is last, so a more specific prefix always wins", () => {
    expect(PATH_ROUTES.at(-1)?.prefix).toBe("/");
    expect(PATH_ROUTES.at(-1)?.backend).toBe(LANDING_CONTAINER);
  });
});

describe("the Cloudflare Access boundary", () => {
  /**
   * The whole point of the split: a visitor reading the public pages must never
   * meet a login prompt, while the app and its API stay gated.
   */
  test("gates exactly the paths the web container answers", () => {
    for (const { prefix, backend } of PATH_ROUTES) {
      expect(isGated(prefix)).toBe(backend === WEB_CONTAINER);
    }
  });

  test("leaves every page a landing-page reader can reach ungated", () => {
    for (const entry of NAV) {
      expect(isGated(entry.path)).toBe(false);
    }
    for (const contract of PAGE_CONTRACTS) {
      expect(isGated(contract.route)).toBe(false);
    }
  });

  test("gates the app and its API, deep links included", () => {
    for (const path of ["/app", "/app/", "/app/settings", "/api/health"]) {
      expect(isGated(path)).toBe(true);
    }
  });

  test("names the two gated prefixes and nothing else", () => {
    expect([...GATED_PREFIXES].toSorted()).toEqual([API_PROXY_PATH, APP_BASE_PATH].toSorted());
  });
});
