# Security policy

miel is self-hosted: you run it against your own Google OAuth client, your own Claude credential and your own Postgres. But an instance holds Gmail OAuth **refresh tokens** and the contents of your mailbox, so a flaw here is a flaw with real reach — hence this file.

## Reporting a vulnerability

Email **[lucasriondelpro@gmail.com](mailto:lucasriondelpro@gmail.com)** with what you found, how to reproduce it, and what it lets an attacker do. Do not open a public issue for a vulnerability: this is a self-hosted app, so every running instance stays vulnerable until its operator pulls the fix.

Expect an acknowledgement within a few days. This is a personal project with no security team and no bounty; what you get is a fix, credit in the release notes if you want it, and a straight answer if the report is not something I intend to fix.

## Scope

In scope — anything in this repository:

- authentication and authorization on `@miel/api` (the `API_SECRET` bearer gate, CORS, route-level checks)
- handling of Google OAuth tokens: encryption at rest (`TOKEN_ENCRYPTION_KEY`), the OAuth callback, scope handling
- what leaves the machine — the data sent to Anthropic during triage and reply drafting, documented in `packages/core/src/claudeUsage.ts`
- injection, SSRF, path traversal or RCE reachable from the API, the CLI or the web app
- the Docker images and compose files, and anything in `DEPLOY.md` that would expose an instance by following it

Out of scope:

- vulnerabilities in Google, Anthropic, Bun, Postgres or any other dependency — report those upstream; tell me only if miel's use of them is what makes them exploitable
- an operator's own deployment mistakes: a missing `TOKEN_ENCRYPTION_KEY` in production, a guessable `API_SECRET`, or exposing the API to the internet, which it is not built for
- findings from automated scanners with no demonstrated impact

## What an operator should know

The API is not meant to face the public internet. It authenticates every non-`/health` route with a single shared bearer token, CORS defaults to `http://localhost:3000`, and there is no per-user model. Put it behind your own network boundary. In production, set `TOKEN_ENCRYPTION_KEY` — refresh tokens are encrypted with it, and it is required there for that reason.
