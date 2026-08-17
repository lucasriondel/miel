# Contributing to miel

Issues and pull requests are welcome. The repository is the whole product — there is no private fork and no hosted variant with extra code in it.

This file is the short version, addressed to a person. [`CLAUDE.md`](CLAUDE.md) at the root is the long version, addressed to the coding agents that work on this repo; it has the full account of the data model, the package layout and the tooling. When the two disagree, `CLAUDE.md` is the one that is kept current with the code.

## Getting set up

You need [Bun](https://bun.sh) 1.3+, Docker (for Postgres), a Google Cloud project with the Gmail API enabled and an OAuth **Web application** client (the README's [Creating the Google OAuth client](README.md#creating-the-google-oauth-client) walks through making one), and a credential for one AI provider. The default is `claude-code`, so unless you change it that means the [Claude Code](https://claude.com/claude-code) CLI on your `PATH` with a token from `claude setup-token`; switch a task to Anthropic, Google or OpenAI and it needs that vendor's API key, which you paste into the app rather than into `.env`.

```bash
git clone git@github.com:lucasriondel/miel.git
cd miel
bun install                                       # public registries only — no token, no auth setup

cp .env.example .env                              # then fill it in — see the README

docker compose -f docker-compose.dev.yml up -d    # Postgres on :5435

bun dev                                           # api on :3001, web on :3000
```

The API applies pending drizzle migrations on boot, so there is no separate migrate step. Open <http://localhost:3000/app> and click *Connect with Google*; triage runs from the first sync, on the default `claude-code` provider — so paste the token from `claude setup-token` under *Settings → AI & Triage → Credentials* first, since no AI credential is read from the environment. That same panel is where you point a task at Anthropic, Google or OpenAI instead. The README's *Filling in `.env`* table says which keys need real values; the rest of `.env.example` has working localhost defaults.

`bun dev` runs the API and the web app only. The landing page is independent — `cd packages/landing-page && bun run dev` puts it on :5200.

## Before you open a pull request

Every pull request is gated on four checks, and CI (`.github/workflows/ci.yml`) runs exactly these:

```bash
bun run lint            # oxlint, against the root .oxlintrc.json
bun run format:check    # oxfmt — `bun run format` rewrites what this rejects
bun run typecheck       # tsc --noEmit across packages
bun run test            # every package's suite
```

CI splits them across two jobs — the three static checks answer in about a minute, while the suite waits on a Postgres service container — but a failure in either one fails the pull request.

`@miel/web`'s suite runs in a DOM: `packages/web/bunfig.toml` preloads `src/testing/domHarness.ts`, which registers happy-dom and React Testing Library's `cleanup` before any test file loads. A test renders a component and clicks a button; no test file sets up a global of its own, and a suite that did would leak it into every file after it. Assert behaviour, not source: a regex over a component's file pins a spelling, so it breaks on a rename that changed nothing and passes on a component wired to the wrong thing. Reading source is for what no render can answer — the repo's own shape, or a scan of the whole codebase for a word. Stub `fetch` rather than mocking the api client, and let an unseeded request fail loudly.

`@miel/web` and `@miel/landing-page` run their tests directly. `@miel/core` and `@miel/api` talk to a real database: locally they start an ephemeral Postgres container, so their suites need a reachable Docker daemon; without one they fail on connection refused rather than on anything you wrote. Setting `DATABASE_URL` to a Postgres you already have running makes them use that instead, which is how CI runs them.

If you disagree with a lint rule, change `.oxlintrc.json` and say why on the line above — an inline `// oxlint-disable-next-line <rule> -- <reason>` needs the `-- <reason>`, and a test enforces it.

## Conventions

- **TypeScript is strict.** No implicit `any`, no skipped null checks.
- **Public exports live in `packages/core/src/index.ts`.** A new service, schema or adapter is exported there, not imported from a deep path by another package.
- **API routes stay thin.** A route in `packages/api/src/routes/*` validates shape with Zod and delegates to a core service; the business logic belongs in the service.
- **External systems are reached from one place each.** Google is the Effect services under `packages/core/src/google/` (`GmailMessages`, `Labels`, `Filters`, …); Claude is `packages/core/src/claude/Claude.ts`, which shells out to the `claude` CLI. They return typed results and fail with the tagged errors in `errors.ts`. Nowhere else parses a raw response or raw stdout.
- **React: one component per file**, and prefer small composable subcomponents over one large `return`.
- **Validation is Zod**, everywhere — env, API I/O, and anything parsed out of Claude or Gmail.
- **A migration ships with its snapshot.** `bunx drizzle-kit generate` writes both the `packages/core/drizzle/NNNN_*.sql` the migrator applies and the `drizzle/meta/NNNN_snapshot.json` the *next* `generate` diffs against. Nothing at runtime reads the snapshot, so a hand-written migration without one fails nowhere and quietly makes the next generated migration wrong.

## The design system does not update through an install

UI primitives come from **gousse-ui**, consumed as a [shadcn registry](https://ui.shadcn.com/docs/registry) rather than as a package. The registry *copies source into this repo*: components land in `packages/web/src/components/ui/`, registry libs in `packages/web/src/lib/gousse/`, stylesheets in `packages/web/src/styles/gousse/`.

The consequence is easy to be surprised by: **those files never update through `bun install`**. There is no version to resolve. An upstream fix reaches miel only when someone re-runs the add for that item and reviews the diff:

```bash
cd packages/web
bunx shadcn@latest add @gousse/button   # overwrites the vendored copy in place
git diff src/components/ui/button.tsx   # local edits are yours to keep or re-apply
```

For the same reason, `components/ui` and `lib/gousse` are exempt from the formatter and the linter: a fix applied there is undone by the next re-add. Fix it upstream in gousse-ui instead. [`packages/web/DESIGN.md`](packages/web/DESIGN.md) §10 has the rest — which primitives are vendored, and the stylesheet load order.

## Reporting things

Use the issue templates: a bug report wants what you did, what happened, and what you expected; a feature request wants the problem before the solution.

Security problems do not go in a public issue — see [`SECURITY.md`](SECURITY.md).
