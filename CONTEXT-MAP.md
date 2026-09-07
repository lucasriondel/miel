# Context map

miel is a Bun/Turborepo workspace. Its contexts are the packages under `packages/*`; the shared vocabulary they all speak is at the root.

Most of miel's domain language is cross-package by construction — `@miel/core` defines the nouns (Provider, Provider credential, Attachment) and the API, web app and CLI all consume them — so the root glossary is the substantial one and the per-package files stay small or absent. See `docs/agents/domain.md` for the rule on where a term goes.

## Shared

| Where | What |
| --- | --- |
| [`CONTEXT.md`](./CONTEXT.md) | System-wide glossary — the terms every package speaks. |
| [`docs/adr/`](./docs/adr/) | System-wide architectural decisions. |

## Contexts

| Context | Package root | Glossary | ADRs |
| --- | --- | --- | --- |
| **Core** — env, db schema, Zod schemas, the error taxonomy, the Effect Gmail and Claude services, the stores seam, and the business services (sync, apply, messages, reply, accounts, labels, settings). Everything else depends on it. | `packages/core/` | _not yet written_ | _none yet_ |
| **API** — the Hono HTTP API. Routes thinly wrap core services; bearer auth via `API_SECRET`. | `packages/api/` | _not yet written_ | _none yet_ |
| **Web** — the Vite SPA served under `/app`. The inbox, message detail, compose window, settings and the gousse-ui design system. | `packages/web/` | _not yet written_ | _none yet_ |
| **CLI** — the `miel` Commander CLI for sync/accounts/apply/reply/db ops. Headless runs and smoke tests. | `packages/cli/` | _not yet written_ | _none yet_ |
| **Landing page** — the public site at the host root (home, `/privacy`, `/terms`). TanStack Start, prerendered, no JavaScript in the output. Depends on core only through leaf subpaths. | `packages/landing-page/` | _not yet written_ | _none yet_ |

A glossary or ADR directory appears when `/domain-modeling` actually resolves a term or a decision for that package — they are written lazily, not scaffolded upfront. Update the table when one lands.
