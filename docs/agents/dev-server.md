# Dev server, portless and local scripts

`bun dev` runs each package behind **portless**, which fronts the dev servers at stable HTTPS hostnames — `miel.localhost`, `api.miel.localhost`, `landing.miel.localhost` — and hands each child an ephemeral port in `PORT`. Every package's real dev command is `dev:app`; its `dev` is just `portless`.

The web app is served under the `/app` prefix (`APP_BASE_PATH` in `packages/core/src/appBasePath.ts` — Vite's `base`, the router's `basename`, and nginx's SPA fallback all derive from it). The `/api` proxy sits outside the prefix: the app must reach its API same-origin.

The API applies pending drizzle migrations on boot (`runMigrations()` in `packages/api/src/index.ts`) and exits non-zero if they fail. Standalone: `bun run --env-file=.env packages/core/src/db/migrate.ts`.

Each app name is written **twice**, and both spellings are load-bearing: `portless.json` at the root (read by a bare `portless` run from the root) and the per-package `"portless"` key in each `package.json` (what names the hosts under turbo, which runs portless with the cwd set to each package — it does not walk up to the root file). Renaming an app or pinning its port means editing both. To bypass the proxy and bind the registry's rows (~/dev/PORTS.md — web 5230, api 5531, landing page 5200), run a package's `PORTLESS=0 bun dev:app`. Configs that need an *address* carry both spellings and pick on `PORTLESS_URL`, which portless sets in every child.

Each dev server must bind `PORT` first and fall back to its row — `Number(process.env.PORT ?? API_PORT)` in `packages/api/src/index.ts`, `Number(process.env.PORT ?? webPort)` in web's vite config. A server that binds its own row is routed to a port nothing listens on: every request answers 502 while both sides print a healthy startup. `packages/web/src/devHostnames.test.ts` guards the names and this rule.

## Beyond `bun dev`

The root `bun dev` is scoped to `@miel/api` + `@miel/web`. Run the landing page on its own with `cd packages/landing-page && bun run dev` (https://landing.miel.localhost; direct, `PORTLESS=0 bun run dev:app` on :5200, strict-port). `bun run build` at the root builds it too, since the container needs its prerendered output.

CLI: `cd packages/cli && bun run src/index.ts <accounts list | sync --since 7d | apply <messageId> ...>`.

`packages/api/scripts/smoke-api.ts`, `packages/cli/scripts/smoke-cli.ts` and `packages/cli/scripts/seed-apply.ts` seed against the account in `MIEL_TEST_ACCOUNT`. They are stale: they import `syncAccountsFromGog` and `GogAdapter`, which core no longer has, so they fail to load until ported onto the Effect Gmail services.
