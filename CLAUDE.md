# Miel

Gmail triage tool. Fetches messages via `gog` (Google CLI), classifies them with Claude (priority + label suggestions), and surfaces them in a local web UI for review/apply/reply.

## Stack

- Runtime: **Bun 1.3** (set in `package.json`'s `packageManager`). Use `bun` for installs and scripts, not npm/pnpm.
- Monorepo: **Turborepo** with Bun workspaces under `packages/*`.
- Language: TypeScript (ES2022, strict, bundler resolution — see `tsconfig.base.json`).
- DB: **Postgres 16** via Docker, accessed with **drizzle-orm** + `postgres` driver. Schema in `packages/core/src/db/schema.ts`, migrations in `packages/core/drizzle/`.
- API: **Hono** on Bun.serve.
- Web: **React 19 + Vite 6 + Tailwind 3 + TanStack Query 5 + React Router 7**.
- Validation: **Zod** everywhere (env, API I/O, Claude/gog JSON).

## Packages

- `@miel/core` — env, db client + schema, Zod schemas, adapters (`gog`, `claude`, `shell`), and business services (`sync`, `apply`, `messages`, `reply`, `accounts`, `labels`, `settings`). Everything else depends on this.
- `@miel/api` — Hono HTTP API. Routes in `src/routes/*` thinly wrap core services. Bearer auth via `API_SECRET`.
- `@miel/web` — Vite SPA. Talks to the API through `/api` (Vite dev proxy → `API_PORT`).
- `@miel/cli` — `miel` Commander CLI for sync/accounts/apply/reply/db ops. Useful for headless runs and smoke tests.

## External binaries (must be on PATH or set via env)

- `GOG_BIN` (default `/opt/homebrew/bin/gog`) — Google CLI used for all Gmail I/O. The `gog` adapter shells out and parses JSON.
- `CLAUDE_BIN` (default `claude`) — Claude Code CLI invoked headlessly by `adapters/claude.ts` for triage and reply generation.

## Running locally

```bash
# 1. Boot Postgres
docker compose up -d

# 2. Install deps
bun install

# 3. Apply migrations (drizzle)
bun run --env-file=.env packages/core/src/db/migrate.ts
# (or: bunx drizzle-kit migrate)

# 4. Dev — runs api (3001) + web (3000) only; see root package.json
bun dev
```

The root `bun dev` is scoped to `@miel/api` + `@miel/web` deliberately; core/cli don't have long-running dev tasks.

CLI examples:

```bash
cd packages/cli
bun run src/index.ts accounts sync          # pull gog accounts into db
bun run src/index.ts sync --since 7d        # fetch + triage
bun run src/index.ts apply <messageId> ...  # apply suggestions
```

## Environment

`.env` at repo root is the single source of truth — loaded by `bun run --env-file=../../.env` (api/cli) and by Vite via `envDir: '../..'`. See `.env.example`. Required keys: `DATABASE_URL`, `GOG_BIN`, `CLAUDE_BIN`, `API_SECRET`, `API_PORT`, `WEB_PORT`, `VITE_API_BASE`, `VITE_API_SECRET`. `VITE_API_SECRET` must match `API_SECRET` (web sends it as a bearer token).

Env is parsed/validated once via `getEnv()` in `packages/core/src/env.ts`.

## Data model (high level)

- `accounts` — Gmail accounts known to `gog`.
- `labels` — Gmail labels per account (synced).
- `messages` — fetched Gmail messages (PK: `accountId + gmailMessageId`). Bodies stored as text + html.
- `message_labels` — join.
- `triages` — one row per Claude triage run per message (priority + reasoning + model/runId).
- `triage_label_suggestions` — existing labels Claude suggests (status: pending/applied/dismissed).
- `suggested_labels` — *new* labels Claude proposes that don't exist yet.
- `app_settings` — KV for model picks etc. (see `services/settings.ts`).

## Conventions

- All public exports live in `packages/core/src/index.ts`. Add new service/schema/adapter exports there.
- API routes do shape-validation with Zod and delegate to core services — keep business logic out of routes.
- Adapters (`gog`, `claude`) are the only place we shell out. They return typed (Zod-parsed) results; never trust raw CLI stdout elsewhere.
- React: one component per file, prefer small composable subcomponents over big `return`s (this is a global preference).
- TS is `strict`. No implicit `any`, no skipping null checks.

## Useful scripts

- `bun run typecheck` (root) — turbo runs `tsc --noEmit` across packages.
- `bun run build` — turbo build.
- `packages/api/scripts/smoke-api.ts`, `packages/cli/scripts/smoke-cli.ts` — quick end-to-end smoke tests.
- `packages/cli/scripts/seed-apply.ts` — seed helper for apply flows.

## Things to know

- The API is **not** public-facing; it auths every non-`/health` route with a single bearer token (`API_SECRET`). CORS is locked to `http://localhost:3000` by default.
- `PRD.md` and `progress.txt` at the repo root are the product spec and a running build log respectively — useful when planning new features, but they aren't code.
- Triage runs in batches of 15 messages (`TRIAGE_BATCH_SIZE` in `services/sync.ts`) and truncates bodies to 4000 chars before sending to Claude.
