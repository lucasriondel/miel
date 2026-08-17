<p align="center">
  <img src="packages/web/public/miel.webp" alt="miel" width="140" />
</p>

<h1 align="center">miel</h1>

Self-hosted Gmail triage. Fetches your mail through the Gmail API, asks an AI to rank it by priority and suggest labels, and shows the results in a local web UI where you review, apply, and reply.

Everything runs on your machine: your own Google OAuth client, your own AI provider credential, your own Postgres. The only thing that leaves your machine is what goes to the AI provider you picked — see [What the AI sees](#what-the-ai-sees).

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/miel-dark.webp">
    <img src="docs/miel-light.webp" alt="miel triaging a week of mail into priority buckets, with a filter suggested by the AI at the top" width="100%">
  </picture>
</p>

## What it does

- **Sync** — pulls recent messages for one or more connected Gmail accounts.
- **Triage** — the AI assigns a priority and suggests labels (existing ones, plus new ones worth creating). Suggestions are proposals; nothing touches Gmail until you apply it.
- **Apply** — add/remove labels, archive, trash, create labels, all in batch from the UI.
- **Reply** — draft a reply with the AI, edit it, send it.
- **Filters** — browse your Gmail filters, and merge several into one.

A CLI (`@miel/cli`) covers the same sync/apply/reply flows headlessly.

## Stack

Bun · Turborepo · TypeScript · Hono · React 19 + Vite + Tailwind 4 · Postgres 16 + drizzle-orm · Effect · `googleapis` · the Claude Code CLI invoked headlessly, or the Anthropic, Google and OpenAI APIs over HTTP.

| Package | What |
| --- | --- |
| `@miel/core` | db, schemas, Google + AI provider services, business logic |
| `@miel/api` | Hono HTTP API |
| `@miel/web` | React SPA |
| `@miel/cli` | `miel` command-line client |
| `@miel/landing-page` | the public static site |

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- Docker (for Postgres)
- A Google Cloud project with the Gmail API enabled and an OAuth **Web application** client — nothing installs this one; [Creating the Google OAuth client](#creating-the-google-oauth-client) walks through making it
- A credential for **one** AI provider, which decides whether you need a CLI at all:
  - `claude-code` — **the shipped default**, for triage, replies and filter suggestions alike: the [Claude Code](https://claude.com/claude-code) CLI on your `PATH`, with a token from `claude setup-token`. A fresh install runs on this until you change it.
  - `anthropic`, `google` or `openai` — an API key for that vendor, pasted into the app after first boot, once you have switched to it in *Settings → AI & Triage*. No CLI needed.

## Run it locally

```bash
git clone git@github.com:lucasriondel/miel.git
cd miel
bun install

cp .env.example .env    # then fill it in — see below

docker compose -f docker-compose.dev.yml up -d    # Postgres on :5435

bun dev                 # api on :3001, web on :3000 (migrations run on API boot)
```

Open **http://localhost:3000/app** and click *Connect with Google*, then open *Settings → AI & Triage → Credentials* and paste the token from `claude setup-token`. Triage runs on the default `claude-code` provider, so that token is what your first sync sends sender, subject and snippet through the local Claude Code CLI with. To send it somewhere else instead, point triage, replies and filter suggestions at Anthropic, Google or OpenAI in that same panel and paste that vendor's API key.

### Filling in `.env`

`.env` at the repo root is the single source of truth. The keys that need real values:

| Key | How to get it |
| --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | An OAuth client of your own, made once in the Google Cloud console — [Creating the Google OAuth client](#creating-the-google-oauth-client) walks through it. The redirect URI already defaults to the local one. |
| `API_SECRET` / `VITE_API_SECRET` | any random string — **the two must match** (the web app sends it as a bearer token) |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32`. Optional in dev, required in production. |

The rest of `.env.example` has sane localhost defaults.

**No AI credential is an env key.** There is no `ANTHROPIC_API_KEY` to set, and no `CLAUDE_CODE_OAUTH_TOKEN` either — setting one in `.env` does nothing, because nothing reads it. Every one of them is pasted in the app under *Settings → AI & Triage → Credentials*, one row per provider, and stored in Postgres encrypted with `TOKEN_ENCRYPTION_KEY`: a vendor API key for Anthropic, Google or OpenAI, and for `claude-code` — the default provider, and the one a fresh install triages with — the token from `claude setup-token`. So a fresh deployment holds no AI credential until someone adds one, changing one takes no redeploy, and the first sync fails with a clear "not configured" message until that row exists.

### Creating the Google OAuth client

miel signs into Gmail with an OAuth client of *yours* — there is no shared one to borrow, which is the price of it being self-hosted. It is made once, in the [Google Cloud console](https://console.cloud.google.com/), and it is the first thing the app asks for on a fresh install: with no client there is no consent URL, so *Connect with Google* has nothing to offer.

1. **Create or select a Google Cloud project.** Pick a project in the console's top bar, or create one. Everything below belongs to that project, and a throwaway project of your own is fine — this client is only ever used by your own deployment.
2. **Enable the Gmail API.** *APIs & Services → Library →* search *Gmail API →* **Enable**. Skipped, sign-in still succeeds and every mail request afterwards fails.
3. **Configure the OAuth consent screen.** *APIs & Services → OAuth consent screen*, user type **External**. Leave it in **Testing** — personal use needs no verification review — and add every Gmail address you plan to connect as a test user, under *Audience*. An address that is not listed ends the consent flow in `access_denied`.
4. **Create an OAuth client ID of type Web application.** *APIs & Services → Credentials → Create credentials → OAuth client ID*, application type **Web application**. It is the only type with somewhere to register the callback URL below; the name is only shown on the consent screen.
5. **Register the redirect URI on that client.** Add `http://localhost:3001/auth/google/callback` under *Authorized redirect URIs* for a local run, and for a deployment the same `/auth/google/callback` path on the public origin the API is reached at (`DEPLOY.md` §2 has the deployed form — both URIs can live on one client). It must match `GOOGLE_REDIRECT_URI` **byte for byte** — scheme, host, path, no trailing slash — or Google refuses the sign-in with `redirect_uri_mismatch` before miel is reached at all.
6. **Copy the client ID and secret into `.env`, then restart the API.** Client id → `GOOGLE_CLIENT_ID`, client secret → `GOOGLE_CLIENT_SECRET`, the URI you just registered → `GOOGLE_REDIRECT_URI`. The three are read once at startup, so restart the API; the first-run setup step clears itself on its next check.

`invalid_client` at the consent screen means the id or the secret is wrong; `redirect_uri_mismatch` means step 5 is. Both are Google's own errors, raised before the browser comes back, so nothing in miel's logs explains them.

### Google OAuth scopes

miel requests the minimum set it can operate with:

| Scope | Used for |
| --- | --- |
| `gmail.modify` | read messages, labels, archive/trash |
| `gmail.send` | sending replies |
| `gmail.settings.basic` | reading and creating filters |
| `userinfo.profile`, `userinfo.email` | identifying the connected account |

Your OAuth client starts in *Testing* mode, so add your own address as a test user. No verification is needed for personal use.

## What the AI sees

Triage sends only sender, subject, snippet, and label names — never the body. Through the Claude Code CLI the model can fetch a body from the local API when it needs one (drafting a reply), truncated to 8000 characters; a hosted provider has no tool to do that and is never sent one. Batch size and truncation live in `packages/core/src/claudeUsage.ts`.

Each task — triage, reply, filter suggestions — runs through a provider you pick in Settings: the local Claude Code CLI, or Anthropic, Google or OpenAI over their API with a key you paste there (stored encrypted, never an env var).

## Other commands

```bash
bun run typecheck        # tsc --noEmit across packages
bun run build            # turbo build
bun run lint
bun run test

cd packages/cli
bun run src/index.ts accounts list
bun run src/index.ts sync --since 7d
```

`bun dev` tees each server's output into `logs/api.log` and `logs/web.log`.

## Running with Docker (no Bun needed)

The root `docker-compose.yml` builds and runs the whole stack — Postgres, `@miel/api`, `@miel/web` — in one shot. This is the fastest way to self-host without installing Bun locally.

```bash
cp .env.example .env    # GOOGLE_CLIENT_ID/SECRET, API_SECRET/VITE_API_SECRET (must match),
                        # TOKEN_ENCRYPTION_KEY — no AI credential goes here

docker compose up -d --build
```

`docker-compose.yml` passes no AI credential to the API at all: the Claude Code token and the three vendor keys are runtime secrets in Postgres, so the stack starts without one and fails at the first triage rather than at boot. Open *Settings → AI & Triage → Credentials* before your first sync and paste the token from `claude setup-token`, or switch every task to Anthropic, Google or OpenAI there and paste that vendor's key instead.

`web` builds against `VITE_API_BASE`/`VITE_API_SECRET` from `.env` as Docker **build args** (baked into the bundle at image-build time, not read at runtime — rebuild with `--build` after changing either). `api` reads the rest of `.env` as normal runtime environment. Open **http://localhost:3000/app**.

This is a separate file from `docker-compose.dev.yml`, which only starts Postgres for a `bun dev` workflow (see above).

## Deploying

`DEPLOY.md` documents the Dokploy setup used for the hosted instance (per-service deploys, Traefik path routing, Cloudflare Access). Production also needs `WEB_ORIGIN`, a production `GOOGLE_REDIRECT_URI`, and a real `TOKEN_ENCRYPTION_KEY`.

## Contributing

Issues and PRs welcome — [CONTRIBUTING.md](CONTRIBUTING.md) has the setup, the checks CI gates a pull request on, and the conventions the codebase follows.

Found a security problem? Don't open a public issue: [SECURITY.md](SECURITY.md) has the disclosure address and what's in scope.

## License

MIT — see [LICENSE](LICENSE).
