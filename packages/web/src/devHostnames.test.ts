import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Every app's dev hostname is written twice, and both spellings are
 * load-bearing.
 *
 * `portless.json` at the root holds the `apps` map, which is what a bare
 * `portless` run *from the repo root* reads. `bun dev` is not that run: it is
 * `turbo run dev`, and turbo spawns `portless` with the cwd set to each
 * package, where portless resolves its config locally and does not walk up to
 * the root file. Every app therefore came up under its bare package name —
 * `api.localhost`, `web.localhost` — with the root map ignored. The
 * per-package `"portless"` key is what portless actually reads there, and it
 * documents that key as taking precedence over a `portless.json` app entry, so
 * the two can hold the same values without either winning by accident.
 *
 * The failure mode this guards is the quiet one: rename an app or pin its port
 * in one of the two files and everything still starts, just at the other
 * file's hostname depending on where it was run from.
 */
const repoRoot = resolve(import.meta.dirname, "../../..");

type AppConfig = {
  name: string;
  script: string;
  appPort?: number;
};

const rootConfig = JSON.parse(readFileSync(join(repoRoot, "portless.json"), "utf8")) as {
  apps: Record<string, AppConfig>;
};

const packagePortless = (packagePath: string): unknown =>
  (
    JSON.parse(readFileSync(join(repoRoot, packagePath, "package.json"), "utf8")) as {
      portless?: unknown;
    }
  ).portless;

/**
 * What portless hands a child, and what a package has to bind for the proxy's
 * route to reach it. Both dev servers are read as source rather than imported:
 * vite's config is a factory over `loadEnv`, and the API's entry point boots a
 * server, runs migrations and starts the scheduler at import time.
 */
const readSource = (path: string): string => readFileSync(join(repoRoot, path), "utf8");

const EXPECTED_HOSTNAMES: Record<string, string> = {
  "packages/web": "miel",
  "packages/api": "api.miel",
  "packages/landing-page": "landing.miel",
};

describe("dev hostnames", () => {
  test("the root map covers every app, and no others", () => {
    expect(Object.keys(rootConfig.apps).toSorted()).toEqual(
      Object.keys(EXPECTED_HOSTNAMES).toSorted(),
    );
  });

  for (const [packagePath, hostname] of Object.entries(EXPECTED_HOSTNAMES)) {
    describe(packagePath, () => {
      test(`is named ${hostname} in the root map`, () => {
        expect(rootConfig.apps[packagePath]?.name).toBe(hostname);
      });

      /**
       * The one that actually names the host under `bun dev`. Without it the
       * app answers at its bare package name and the root map is never read.
       */
      test("carries its own portless key, which is what turbo's cwd makes portless read", () => {
        expect(packagePortless(packagePath)).toEqual(rootConfig.apps[packagePath]);
      });

      /**
       * The proxy runs a named script rather than `dev`, because `dev` is
       * `portless` itself and running it would recurse.
       */
      test("points portless at dev:app, not at the dev script that invokes portless", () => {
        expect(rootConfig.apps[packagePath]?.script).toBe("dev:app");
      });
    });
  }
});

/**
 * The 502 this exists to prevent: portless registers the port it handed out,
 * the server binds its own pinned row instead, and every request through the
 * hostname reaches a port nothing is listening on. `bun dev` still prints a
 * healthy-looking startup on both sides, so nothing announces the mismatch.
 *
 * The rule is one line in each server: take `PORT` when portless set one, fall
 * back to the registry's row (~/dev/PORTS.md) for a direct
 * `PORTLESS=0 bun dev:app` run and for production.
 */
describe("the injected PORT", () => {
  test("is what the API binds, ahead of its own API_PORT row", () => {
    expect(readSource("packages/api/src/index.ts")).toContain(
      "Number(process.env.PORT ?? API_PORT)",
    );
  });

  test("is what the web dev server binds, ahead of its own WEB_PORT row", () => {
    expect(readSource("packages/web/vite.config.ts")).toContain(
      "Number(process.env.PORT ?? webPort)",
    );
  });
});
