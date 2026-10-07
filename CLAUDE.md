# Miel

Gmail triage tool. Fetches messages via the Google Gmail REST API (`googleapis`), classifies them with an AI provider (priority + label suggestions), and surfaces them in a local web UI for review/apply/reply. `PRD.md` at the repo root is the product spec — read it when planning a feature.

## Stack

- Runtime: **Bun 1.3**, **Turborepo** with Bun workspaces under `packages/*`. TypeScript strict (`tsconfig.base.json`).
- DB: **Postgres 16** via Docker, **drizzle-orm** + `postgres`. Schema `packages/core/src/db/schema.ts`, migrations `packages/core/drizzle/`.
- API: **Hono** on Bun.serve. Effect services wrap Google and the AI providers. **Zod** at every edge.
- Web: **React 19 + Vite 8 + Tailwind 4 + TanStack Query 5 + React Router 7**. Tailwind 4 is CSS-first: no `tailwind.config.js`; `packages/web/src/index.css` is the entry and the vendored gousse sheets' `@theme` defines the tokens. UI primitives are vendored from the gousse-ui shadcn registry (`packages/web/components.json`).

## Packages

- `@miel/core` — env, db, Zod schemas, `errors.ts`, Google services (`google/*`), the AI service (`claude/*`), stores, business services. Everything depends on it.
- `@miel/api` — Hono routes in `src/routes/*`, thin over core. Bearer auth via `API_SECRET`.
- `@miel/web` — Vite SPA under the `/app` prefix (`packages/core/src/appBasePath.ts`), reaching its API same-origin at `/api`.
- `@miel/cli` — `miel` Commander CLI for headless sync/accounts/apply/reply.
- `@miel/landing-page` — public site (home, `/privacy`, `/terms`), prerendered static HTML with no JS, importing core only through leaf subpaths.

## Run and check

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres
bun install                                      # public registries, no auth
bun dev                                          # api + web → https://miel.localhost/app
```

The API applies migrations on boot. `bun dev` tees output to `logs/api.log` and `logs/web.log` — read those for current server output.

`.github/workflows/ci.yml` gates every pull request on exactly four checks: `bun run lint`, `bun run format:check`, `bun run typecheck` (the `checks` job) and `bun run test` (the `tests` job, against a `postgres:16` service with `DATABASE_URL` set; locally the core/api suites start their own container when it is unset). Run all four before calling work done.

## Before you start

- **Credentials live in Postgres, not `.env`.** No AI credential is an env var — a vendor key or the Claude Code token is pasted in Settings and stored encrypted. The default provider is `claude-code`, so a fresh install needs that token before it can triage.
- **`CONTRIBUTING.md` is the human mirror.** Changing a check, a convention or a setup step means changing it too; `contributorDocs.test.ts` derives its assertions from the CI workflow.
- **Docs are tested.** `projectDocs`, `contributorDocs`, `linting`, `formatting` and `ci` under `packages/web/src/` read these Markdown files; run them after editing one.

## Pointers

Read the doc before editing in its area — each holds the rules and the reasons a plausible edit breaks.

- **Coding standards** — `CODING_STANDARDS.md`: read before writing or reviewing any code, a test, a migration, or a lint/format exemption.
- **Environment** — `docs/agents/environment.md`: `.env` keys, Google OAuth setup, `SITE_HOST`, `CLAUDE_BIN`, API auth and CORS.
- **Data model** — `docs/agents/data-model.md`: what each table holds.
- **Dev server** — `docs/agents/dev-server.md`: portless hostnames, a 502 from a `.localhost` host, running the landing page or CLI, the smoke scripts.
- **AI providers** — `docs/agents/ai-providers.md`: `claude/*`, `claudeUsage.ts` (what a prompt sends), `providerModels.ts`, `taskProviders.ts`, credentials and the Claude Code token, provider-unavailable errors.
- **Promo codes** — `docs/agents/promo-codes.md`: `promoCodes.ts`, `PromoStore`, `features/promos/*`, `PromoCodePanel`, `promo_codes`.
- **Worp** — `docs/agents/worp.md`: the PDF relay and its settings.
- **Store seam** — `docs/agents/store-seam.md`: a service touching the database, or a core test needing stored rows.
- **App shell** — `packages/web/docs/app-shell.md`: `App.tsx`, `features/shell/*`, a page's top bar, scrolling.
- **Message actions** — `packages/web/docs/message-actions.md`: optimistic mutations, labelling, the label picker, multi-select.
- **Message detail** — `packages/web/docs/message-detail.md`: compose/reply, attachments, browser-local preferences (theme, remote images, default view).
- **Web tests** — `packages/web/docs/testing.md`: the happy-dom harness and its seams.
- **Design** — `packages/web/DESIGN.md`: visual rules and the vendored primitives.
- **Issues** — `docs/agents/issue-tracker.md`: GitHub issues in `lucasriondel/miel` via `gh`, what `#NN` points at.
- **Triage labels** — `docs/agents/triage-labels.md`: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.
- **Domain glossary** — `docs/agents/domain.md` and `CONTEXT-MAP.md`: per-package contexts and shared terms.
