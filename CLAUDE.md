# Miel

Gmail triage tool. Fetches messages via the Google Gmail REST API (`googleapis`), classifies them with Claude (priority + label suggestions), and surfaces them in a local web UI for review/apply/reply.

## Stack

- Runtime: **Bun 1.3**. Use `bun` for installs and scripts.
- Monorepo: **Turborepo** with Bun workspaces under `packages/*`.
- Language: TypeScript (ES2022, strict, bundler resolution — see `tsconfig.base.json`).
- DB: **Postgres 16** via Docker, accessed with **drizzle-orm** + `postgres` driver. Schema in `packages/core/src/db/schema.ts`, migrations in `packages/core/drizzle/`.
- API: **Hono** on Bun.serve.
- Web: **React 19 + Vite 8 + Tailwind 4 + TanStack Query 5 + React Router 7**. Tailwind 4 means CSS-first config: no `tailwind.config.js`, `packages/web/src/index.css` is the entry (`@import "tailwindcss"` then the vendored gousse sheets, whose `@theme` block defines the tokens), and `@tailwindcss/vite` does the scanning.
- Google APIs: **googleapis** + **google-auth-library** (in-app OAuth, per-account refresh tokens stored in Postgres). Effect services in `packages/core/src/google/*` wrap each Gmail resource.
- Validation: **Zod** everywhere (env, API I/O, Claude/Gmail JSON).

## Packages

- `@miel/core` — env, db client + schema, Zod schemas, tagged-error taxonomy (`errors.ts`), Effect Google services (`google/*`), the Claude service (`claude/*`), the `shell` adapter, and business services (`sync`, `apply`, `messages`, `reply`, `accounts`, `labels`, `settings`). Everything else depends on this.
- `@miel/api` — Hono HTTP API. Routes in `src/routes/*` thinly wrap core services. Bearer auth via `API_SECRET`.
- `@miel/web` — Vite SPA. Talks to the API through `/api` (Vite dev proxy → `API_PORT`).
- `@miel/cli` — `miel` Commander CLI for sync/accounts/apply/reply/db ops. Useful for headless runs and smoke tests.
- `@miel/landing-page` — the public site at the root of the deployed host (home, `/privacy`, `/terms`). TanStack Start prerendered to static HTML, styles inlined, no JavaScript and no external assets in the output. Depends on `@miel/core` only through leaf subpaths (`@miel/core/googleScopes`, `@miel/core/claudeUsage`, `@miel/core/appBasePath`), so its build pulls in none of core's db or env code. Ships as its own nginx image (`packages/landing-page/Dockerfile`); `src/deploy/topology.ts` holds the path split between it and `@miel/web`.

## Design system (the gousse-ui registry)

UI primitives come from **gousse-ui**, consumed as a **shadcn registry**, not as an npm package. `packages/web/components.json` points the `@gousse` namespace at `https://lucasriondel.github.io/gousse-ui/r/{name}.json` (public, no auth) and holds the `@/` aliases the copied files land under — components in `packages/web/src/components/ui/`, registry libs in `src/lib/gousse/`, the three stylesheets in `src/styles/gousse/`. App code imports one module per primitive through the `@/` alias (`@/components/ui/button`), never a barrel. `bun install` needs no credentials of any kind.

The maintenance consequence: **vendored components never update through `bun install`** — there is no version to resolve, and a copied file is ours. An upstream gousse-ui fix reaches miel only when someone re-runs the add for that item and reviews the resulting diff:

```bash
cd packages/web
bunx shadcn@latest add @gousse/button   # overwrites the vendored copy in place
git diff src/components/ui/button.tsx   # review: local edits are yours to keep or re-apply
```

`packages/web/DESIGN.md` §10 has the rest — which primitives are vendored, the pinned Base UI prerelease that two of them need, and the stylesheet load order.

## External binaries

- `CLAUDE_BIN` (default `claude`) — Claude Code CLI invoked headlessly by `claude/Claude.ts` for the AI tasks, with the stored Claude Code token injected into the subprocess env. Gmail I/O is in-process via `googleapis`.

## Running locally

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres
bun install
bun dev                                          # api + web, behind portless
```

The API applies pending drizzle migrations on boot (`runMigrations()` in `packages/api/src/index.ts`) and exits non-zero if they fail. Standalone: `bun run --env-file=.env packages/core/src/db/migrate.ts`.

`bun dev` runs each package behind **portless**, which fronts the dev servers at stable HTTPS hostnames — `miel.localhost`, `api.miel.localhost`, `landing.miel.localhost` — and hands each child an ephemeral port in `PORT`. Every package's real dev command is `dev:app`; its `dev` is just `portless`.

The proxy has sharp edges (the twice-written names, the `PORT`-first rule) — see **Dev server** under *Subsystem docs*.

The root `bun dev` is scoped to `@miel/api` + `@miel/web`. Run the landing page on its own with `cd packages/landing-page && bun run dev` (https://landing.miel.localhost; direct, `PORTLESS=0 bun run dev:app` on :5200, strict-port). `bun run build` at the root builds it too, since the container needs its prerendered output.

The web app is served under the `/app` prefix (`APP_BASE_PATH` in `packages/core/src/appBasePath.ts` — Vite's `base`, the router's `basename`, and nginx's SPA fallback all derive from it), so in dev it's at https://miel.localhost/app. The `/api` proxy sits outside the prefix: the app must reach its API same-origin.

CLI: `cd packages/cli && bun run src/index.ts <accounts list | sync --since 7d | apply <messageId> ...>`.

## Environment

`.env` at repo root is the single source of truth — loaded by `bun run --env-file=../../.env` (api/cli) and by Vite via `envDir: '../..'`. See `.env.example`; parsed once via `getEnv()` in `packages/core/src/env.ts`. `VITE_API_SECRET` must match `API_SECRET` (web sends it as a bearer token). No AI credential is an env var — not a vendor key and not `CLAUDE_CODE_OAUTH_TOKEN`; setting one does nothing.

The three Google OAuth values have one walkthrough (#138): `packages/core/src/googleOAuthSetup.ts` is a leaf module with the ordered steps as data, plus the callback path the API route mounts and the dev redirect URI `env.ts` defaults to. Two surfaces render that list: the onboarding gate's first step (`GoogleOAuthSteps.tsx`) and the landing page's installation guide (`GuideStep.substeps`). The README restates them in its own Markdown, and `contributorDocs.test.ts` checks its section against the same list.

`SITE_HOST` sits outside that schema: the public hostname the landing container (`/`), the app (`/app`) and the API proxy (`/api`) share. It is read by `packages/landing-page/src/deploy/topology.ts` and defaults to the reference deployment's host, so hosting miel elsewhere means setting it rather than editing source.

## Data model (high level)

- `accounts` — connected Gmail accounts (email, profile, encrypted OAuth `refresh_token`, granted scopes, `connected_at`).
- `labels` — Gmail labels per account (synced).
- `messages` — fetched Gmail messages (PK: `accountId + gmailMessageId`). Bodies stored as text + html.
- `message_labels` — join.
- `triages` — one row per Claude triage run per message (priority + reasoning + model/runId).
- `triage_label_suggestions` — existing labels Claude suggests (status: pending/applied/dismissed).
- `suggested_labels` — *new* labels Claude proposes that don't exist yet.
- `promo_codes` — one discount code extracted from a marketing mail, keyed back to it. Two states on one row: suggested and saved (`saved_at`). The save also writes six denormalised copies of the mail (subject, sender name/address, `internal_date`, HTML and stripped text), which is what makes a saved promo outlive the Gmail original it trashes. `expires_at` is stored at end-of-day UTC and treated as a date (`promoExpiry.ts`), never an instant.
- `app_settings` — KV for model picks etc. (see `services/settings.ts`).
- `encrypted_secrets` — every secret that is not a Gmail refresh token, one row per secret, AES-256-GCM ciphertext: vendor API keys (named for the vendor), worp's key and proxy headers, and the Claude Code token (dotted names).

## Subsystem docs

Each line names what the doc covers and when to read it. Read the doc before editing in that area — these hold the rules and the reasons a plausible edit would break.

- **Dev server** — portless hostnames, the twice-written app names, the `PORT`-first binding rule, bypassing the proxy: `docs/agents/dev-server.md`, before touching `portless.json`, a package's `portless` key, a dev script, or a 502 from a `.localhost` host.
- **Migrations** — the SQL + snapshot pair and writing a snapshot by hand: `docs/agents/migrations.md`, before changing `schema.ts` or adding anything under `packages/core/drizzle/`.
- **AI providers** — the four tasks, the provider catalogue, the task table and its two prompt columns, the `Claude` injection seam, provider-unavailable errors, credential storage and the never-without-a-key rule, the Claude Code token: `docs/agents/ai-providers.md`, before touching `claude/*`, `providerModels.ts`, `taskProviders.ts`, `encryptedSecrets.ts`, `claudeCodeToken.ts`, `errors.ts`, model settings, or credential UI.
- **Promo codes** — extraction during sync, on-demand extraction, inbox suggestions, save-and-trash, the `/promo-codes` page, copy/view-original, edit/delete, legacy code-less rows: `docs/agents/promo-codes.md`, before touching `promoCodes.ts`, `PromoStore`, `features/promos/*`, `PromoCodePanel`, or `promo_codes`.
- **Worp** — the PDF relay, its split settings, extra-header patching: `docs/agents/worp.md`, before touching `worp*` services, `sendToWorp.ts`, or the worp settings UI.
- **Store seam** — the six stores, the two adapters, `makeTestStores`, the shared contract, the `.dbtest.ts` split: `docs/agents/store-seam.md`, before a service reads or writes the database, or before writing a core test that needs stored rows.
- **App shell** — top-bar portal slot, scroll container, collapsed sidebar and mobile drawer: `packages/web/docs/app-shell.md`, before touching `App.tsx`, `features/shell/*`, a page's top bar, or adding a scroll container.
- **Message actions** — optimistic mutations and rollback, exits from the detail page, mark-read-on-open, adding labels (detail, row, bulk), the shared label picker, multi-select: `packages/web/docs/message-actions.md`, before touching `api/messageMutation.ts`, `api/mutations.ts`, `features/labels/*`, `features/select/*`, or a message action button.
- **Message detail** — the compose window, attachments, the remote-images preference: `packages/web/docs/message-detail.md`, before touching `features/compose/*`, `features/reply/*`, attachment components, or `MessageDetailBody`.
- **Web tests** — the happy-dom harness, rendered wiring suites, which seams to stub: `packages/web/docs/testing.md`, before writing or fixing any `@miel/web` test.

## Conventions

- All public exports live in `packages/core/src/index.ts`. Add new service/schema/adapter exports there.
- API routes do shape-validation with Zod and delegate to core services — business logic belongs in core.
- The Gmail Effect services (`google/*`) and the Claude service (`claude/Claude.ts`) are the only places that reach external systems. They return typed results and fail with distinct `Data.TaggedError`s (`errors.ts`).
- React: one component per file, small composable subcomponents over big `return`s.

## Linting

**oxlint** is the linter: one `lint` script per package (`oxlint -c ../../.oxlintrc.json .`), fanned out by turbo as `bun run lint`, with the single config `.oxlintrc.json` at the repo root (a root devDependency). `.oxlintrc.json` is JSONC — every rule turned off carries a comment on the line above saying why.

Two categories are errors: **correctness** and **suspicious**. No category is ever disabled. The TypeScript, unicorn, oxc, **react**, **react-hooks** and **jsx-a11y** plugins are on repo-wide; the UI plugins are listed globally rather than under an `overrides` entry because oxlint resolves `categories` against the base plugin set only — a plugin added inside an override contributes nothing unless each rule is named there by hand.

Three rules are narrowed in config, each with its reason inline: `react/react-in-jsx-scope` (off, React 19), `eslint/no-underscore-dangle` (allows `_tag` plus the two `_reset*ForTests` hooks), and `jsx-a11y/label-has-associated-control` (told which gousse-ui components render a native control). Fix lint findings rather than silencing them; a call-site exemption is `// oxlint-disable-next-line <rule> -- <reason>`, and the `--` reason is mandatory and test-enforced.

The vendored gousse-ui source (`packages/web/src/components/ui/**`, `packages/web/src/lib/gousse/**`) is exempt from oxlint for the reason it is exempt from formatting: `bunx shadcn@latest add @gousse/<item>` overwrites those files from upstream, so a fix applied there is undone by the next re-add. The generated `packages/landing-page/src/routeTree.gen.ts` is exempt too. `packages/web/src/linting.test.ts` guards all of this, including that the ignore patterns match real files.

`unicorn/no-array-sort` steers `.sort()` onto `Array#toSorted`, which is why `tsconfig.base.json` sets `"lib": ["ES2023"]` (types only; `target` stays ES2022).

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request on Bun 1.3, in two jobs. `checks` is the static gate — `bun run lint`, `bun run format:check`, `bun run typecheck`, each its own step. `tests` runs `bun run test` against a `postgres:16` service container (matching `docker-compose.dev.yml`'s major), with `DATABASE_URL` set for the whole job and migrations applied in their own step first. Install is `bun install --frozen-lockfile` with no auth step.

The handoff is `DATABASE_URL`: `packages/core/scripts/test-with-db.sh` and its `@miel/api` twin start an ephemeral container only when it is unset. `packages/web/src/ci.test.ts` guards the workflow, including the Postgres major and the connection string matching the service's credentials.

## Formatting

**oxfmt** is the only formatter: a `format` / `format:check` pair in every package, run by turbo — `bun run format` rewrites, `bun run format:check` verifies (CI's). Root devDependency; the one config is `.oxfmtrc.json` (defaults plus the ignore list).

The scripts pass `"**/*.{ts,tsx}"` rather than `.` deliberately: JSON, Markdown and CSS here have other owners (`bun add` rewrites `package.json`, `drizzle-kit generate` rewrites `packages/core/drizzle/meta/*.json`), and widening the glob means fighting those tools.

`.oxfmtrc.json` exempts the vendored gousse-ui source — `packages/web/src/components/ui/**` and `packages/web/src/lib/gousse/**` — because `bunx shadcn@latest add @gousse/<item>` overwrites them in place, and formatting them would bury every upstream re-add under whitespace noise. The generated `packages/landing-page/src/routeTree.gen.ts` is exempt too. `packages/web/src/formatting.test.ts` guards all of this.

## Useful scripts

- `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run test` — exactly what CI gates a PR on. `bun run format` rewrites.
- `packages/api/scripts/smoke-api.ts`, `packages/cli/scripts/smoke-cli.ts`, `packages/cli/scripts/seed-apply.ts` — seed against the account in `MIEL_TEST_ACCOUNT`. They are stale: they import `syncAccountsFromGog` and `GogAdapter`, which core no longer has, so they fail to load until ported onto the Effect Gmail services.

## Things to know

- The API is **not** public-facing; it auths every non-`/health` route with `API_SECRET`. CORS is locked to `http://localhost:5230` and `https://miel.localhost` by default.
- `bun dev` tees each dev server's output to `logs/api.log` and `logs/web.log` at repo root (truncated on each restart). Read these directly for current server output.
- `PRD.md` at the repo root is the product spec — useful when planning new features.
- `CONTRIBUTING.md` is this file's human-facing subset and `SECURITY.md` the disclosure policy; `.github/` holds the templates. Changing a check, a convention or a setup step means changing `CONTRIBUTING.md` too — `packages/web/src/contributorDocs.test.ts` derives its assertions from the CI workflow and the landing page's contact constant.
- What goes to a provider is stated in `packages/core/src/claudeUsage.ts` — batch size (default 15, configurable, capped at 50), the 8000-char body truncation, and `BODY_BEARING_TASKS` (reply drafting and promo extraction). Triage sends only sender/subject/snippet/labels; through the CLI the model fetches a body from the local API when it needs one. Four surfaces publish that module: the landing page's disclosure, the privacy policy, the README's "What the AI sees" and `SECURITY.md`'s scope list — change the constants, never a copy. `claude/tasks.test.ts` requires the tasks whose prompts inline a body to be exactly the published list.

## Agent skills

### Issue tracker

GitHub issues in `lucasriondel/miel` via `gh` — what the `#NN` references point at. See `docs/agents/issue-tracker.md`.

### Triage labels

`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

`CONTEXT-MAP.md` at the root indexes the shared glossary plus one context per package. See `docs/agents/domain.md`.
