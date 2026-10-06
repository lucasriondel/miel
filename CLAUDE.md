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

Each app name is written **twice**, and both spellings are load-bearing: `portless.json` at the root (read by a bare `portless` run from the root) and the per-package `"portless"` key in each `package.json` (what names the hosts under turbo, which runs portless with the cwd set to each package — it does not walk up to the root file). Renaming an app or pinning its port means editing both. To bypass the proxy and bind the registry's rows (~/dev/PORTS.md — web 5230, api 5531, landing page 5200), run a package's `PORTLESS=0 bun dev:app`. Configs that need an *address* carry both spellings and pick on `PORTLESS_URL`, which portless sets in every child.

Each dev server must bind `PORT` first and fall back to its row — `Number(process.env.PORT ?? API_PORT)` in `packages/api/src/index.ts`, `Number(process.env.PORT ?? webPort)` in web's vite config. A server that binds its own row is routed to a port nothing listens on: every request answers 502 while both sides print a healthy startup. `packages/web/src/devHostnames.test.ts` guards the names and this rule.

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

## Migrations

A migration is two files: `packages/core/drizzle/NNNN_*.sql` (what the migrator applies) and `packages/core/drizzle/meta/NNNN_snapshot.json` (the schema state it left, which `drizzle-kit generate` diffs the *next* change against). Nothing at runtime reads a snapshot, so the two can drift silently — and a stale snapshot makes the next `generate` re-create objects that already exist (#122).

So: `bunx drizzle-kit generate` from the repo root, which writes both. A hand-written migration (a data rewrite like `0010`) still needs its snapshot written by hand: the previous snapshot plus that migration's effect, chained by `prevId` → the predecessor's `id`. `packages/core/src/db/migrationSnapshots.test.ts` guards the journal, SQL and snapshots listing the same migrations, the `prevId` chain, and the newest snapshot matching `schema.ts`.

## Providers

Each AI task — triage, reply, filter-suggest, `promo-extract` — runs through a provider of its own: `claude-code` (the local `claude` subprocess) or a hosted vendor — `anthropic`, `google`, `openai` — over HTTP through the Vercel ai-sdk. The catalogue is `packages/core/src/providerModels.ts`, a leaf module: which providers exist, each one's curated model list, its default, and `MODEL_TASKS`. The API validates a save against it and the web pickers are built from it. `UpdateSettingsRequest`'s shape and `ModelsCard`'s `MODEL_ROWS` each carry a `satisfies` over a record keyed by `ModelTask`, so a fifth task stops both files compiling until it is named. Note the spelling the hyphen forces: `promo-extract.provider` as a settings key, `"promo-extractProvider"` on `ModelSettings` and on the patch.

That matters because a task with no schema field gets its patch stripped by the parse and answered 200 with nothing changed (#159).

`DEFAULT_PROVIDER` is `claude-code`, and `SETTING_DEFAULTS` is built from it, so a fresh install runs every task through the local CLI before anyone opens Settings. Two consequences the docs have to keep saying: a Claude Code token is required unless the operator switches provider first, and it has to be pasted in Settings; and no copy may claim an install is inert until a provider is picked — the only thing between a fresh install and outbound mail is that credential. `contributorDocs.test.ts` and the landing page's `guide.test.ts` check both against that constant.

Model ids are bare (`claude-haiku-4-5`), never `vendor/model` — the credential lookup is keyed by vendor. Migration `0010` and `normalizeModelSettings` rewrite the old spellings (`hosted-api` → `anthropic`, prefix stripped), so a legacy row still resolves.

Both transports live in **`ai-task-runner-effect`** (`~/dev/perso/ai-task-runner-effect`, on npm), which composes **`claude-code-effect`** for the CLI (`claude -p`, `--allowedTools`, a real session id) and the Vercel ai-sdk for the hosted call (one schema-constrained HTTP call, no tools). Its `makeTaskRunner(table, deps)` holds the one hosted-vs-CLI branch; miel supplies `resolve` (`resolveTaskProviderEffect`) and `credential` (the vendor's key from `encrypted_secrets`, `Redacted`, unwrapped only at the call that spends it). It is a factory, not a tag, so the injection seam stays miel's own.

`claude/tasks.ts` is the task table — one row per `ModelTask` in the package's `TaskSpec` shape: the output contract as an `ObjectCodec` (`zodCodec` wraps each Zod schema; a decode failure is miel's `ClaudeSchemaError`), the CLI prompt builder, the hosted prompt builder, the one-line hosted instruction and the CLI's allowed tools. The service is a single `run(task, input)`; `satisfies Record<ModelTask, …>` makes a row mandatory. Keep the two prompt columns separate: a task whose builders match lists the same one twice, on purpose, so nothing can hand the CLI prompt — the one carrying `API_SECRET` — to a vendor. Triage's hosted prompt drops the "curl the body from the local API" paragraph for exactly that reason. Neither triage prompt inlines a body.

`promo-extract` reads one marketing mail and answers zero or more promos (code, discount, terms, expiry, merchant — no confidence score; an empty array is the negative answer). Both prompt columns hold one builder and `allowedTools` is empty, because it inlines the mail and has no tool: triage's body-fetch paragraph would be dead text carrying `API_SECRET` to a vendor. What it inlines is the mail's *stripped visible text* (`util/htmlText.ts`), truncated at `REPLY_BODY_TRUNCATION` from `claudeUsage.ts`. The truncation sits in the prompt builder, the only thing both transports go through. It is in `claudeUsage.ts`'s `BODY_BEARING_TASKS`, which the landing page and privacy policy build their disclosure from.

`claude/Claude.ts` keeps what is a miel decision: the token's source, the auth heuristic (`looksLikeAuthProblem`), and the mapping of runner/SDK failures onto miel's taxonomy — `TaskNotRunnableError` (the key-deleted race guard) becomes `ProviderNotRunnableError` so a boundary cannot tell the two apart, `HostedApiError`/`TaskSchemaError` become miel's `HostedApiError`. Tests fake both transports at their real seams: `_setCommandExecutorLayerForTests` (the SDK's `ClaudeCodeTest.handler`) for the CLI, `_setHostedGenerateForTests` (the runner's `HostedGenerate`) for the hosted call — `claude/hosted.test.ts` runs the whole hosted path, real credential decryption included, with no network.

`Claude`, the Effect tag in `claude/Claude.ts`, is the single injection seam (#133): every AI caller `yield* Claude`, the boundaries provide `ClaudeLive`, and a suite provides a `ClaudeImpl` through `Layer.succeed(Claude, …)` — `testkit/claude.ts` is the one fake, and no test mocks the module. `run` carries no requirement of its own; the stores the live implementation reads ride in `ClaudeLive`'s `R`. `claude/seam.test.ts` guards the shape, because a second wrapper would compile and pass every behaviour test.

Nothing falls back: a vendor that has no key, or rejects the one it has, fails the run — the user chose which vendor sees their mail. `Claude.ts` asks `resolveTaskProvider(task)` for provider and model, so a hosted vendor with no stored key fails as `ProviderNotRunnableError` before a socket is opened, and `HostedApiError` means only "the vendor call failed". `HostedApiError` carries its reason in `detail`, scrubbed of the key, and the API maps it to `hosted_api_error` (502); a run-phase `ProviderNotRunnableError` maps to `claude_unavailable` (503). The sentence that sends a user to Settings lives at the edges that show it — the sync toast and `apiErrorMessage` — never in a core error.

"Unavailable" is the taxonomy's answer (#126). `errors.ts` owns the union `ProviderUnavailableError` — no Claude Code token, a token the CLI rejected, a task pointed at a vendor with no key — plus `isProviderUnavailable` and the derived tag set every boundary reads. The set is built from a record keyed by the union's `_tag`, so a fourth way to be unavailable is one edit to that file. Sync's catches share one combinator (`sync/providerFailure.ts`): unavailable propagates, everything else is this batch's problem and the run continues. A run that hits it stops the account loop, emits one `sync.provider_unavailable` and records one failed run — the credential and provider pick are global, so every remaining account would fail the same way. `HostedApiError` stays outside the union: the vendor answered and failed, which is one batch's problem.

The event was `sync.claude_unavailable` until #127. The split is in `schemas/syncEvents.ts`: the server emits `SyncServerEvent` (new name only), the client parses `ReceivedSyncServerEvent` (also accepts the old literal). **Removable next release**: the alias schema, the `ReceivedSyncServerEvent` union, and the extra `case` in the web client's `dispatchEvent`. The HTTP error code keeps its name: a refusal on the run path is still `claude_unavailable` (503).

## Provider credentials

A hosted provider's API key lives in `encrypted_secrets` under the vendor's name, encrypted with `TOKEN_ENCRYPTION_KEY` (the same `util/crypto.ts` that protects Google refresh tokens), and is pasted under Settings → AI & Triage → Credentials, which holds one row per provider — the three vendor keys and the Claude Code token. `docs/adr/0001-provider-credentials-in-postgres.md` has the decision. After a deploy there is no credential until someone pastes one.

`services/encryptedSecrets.ts` is the only module that decrypts. Everything outward — API routes, CLI, UI — gets a `ProviderCredentialStatus` (a boolean plus a masked hint like `sk-ant-…3f9`). The hint's shape lives in `packages/core/src/credentialMasking.ts`, a leaf module: first 7 characters, last 3, and no hint at all below 14 characters (a bare ellipsis). The privacy page imports those constants instead of describing them. `readProviderCredentialEffect` returns the plaintext and is deliberately absent from `packages/core/src/index.ts`; `claude/Claude.ts` imports the service module directly and hands the key to the runner `Redacted`. Nothing logs a key: `createDebug` sees the vendor name and booleans, a rejected key is described by a reason code, and vendor SDK error messages are scrubbed of the key before they become a `HostedApiError`.

In the web app `packages/web/src/api/useCredential.ts` owns a credential's whole lifecycle for any of the four providers — configured, hint, loading, saving, clearing, error, draft, save and clear — hiding which endpoint it lives behind (`/settings/provider-credentials/<vendor>` or `/settings/claude-code-token`) and the ladder that picks which failure is shown. `features/settings/CredentialTile.tsx` is the one tile all four get and `credentialCopy.ts` the words they differ in.

The invariant is "a hosted provider is never selected without a credential", and every door into it is shut: selecting a keyless vendor is refused, deleting the key of a vendor a task is pointed at is refused, and the check runs on any patch that touches a task — a model-only edit resolves its vendor from the stored row. All three answer 400 with the same `missing_provider_credential` body naming the task and the vendor.

That rule is core's: `services/taskProviders.ts` (#124). A pure kernel (`taskProviderProblem` plus the two `reject*` functions) takes a patch, what is stored and the *set of vendors that have a key* — booleans, never a key — and answers with a `ProviderNotRunnableError` or null. The checked facades `checkedUpdateModelSettings` and `checkedDeleteProviderCredential` run it before writing, so a two-task patch with one bad half is refused whole; `resolveTaskProvider(task)` answers which provider and model a task runs on, or why it cannot. It composes `settings.ts` and `encryptedSecrets.ts`, neither imports it back, and the CLI and scheduler get the rule without touching the route. Two things it deliberately does not check: `claude-code`, always runnable at save time because its token is a run-time concern and the default points at it; and `setSetting(key, value)`, the raw operator escape hatch.

The refusal carries a `phase` because the resolver also gates runs (#125): `save` is an edit rejected while the user is looking at the picker (400, the reason code as the `error` field); `run` is an install discovering it cannot do the work (503 `claude_unavailable`). Consequence: a model id no provider serves — reachable only through `setSetting` or a dropped catalogue entry — stops the task instead of being passed to the CLI.

## Extracting promo codes

`services/promoCodes.ts` owns the prefilter call and the extraction, and `sync/fetchPhase.ts` calls it right after `stepUpsertAndLink`, because a promo row is keyed to its message.

- **New messages only, once.** The phase hands over what the fetch just upserted. No backfill and deliberately **no extraction-attempted marker** — nothing asks twice, so "found nothing" and "never asked" need no recording. The feature fills forward; adding backfill later means re-extracting a range wholesale.
- **One mail per model call.** A batch invites the model to attribute one shop's code to another. Cost is the prefilter's job; `EXTRACT_CONCURRENCY` bounds concurrency and is deliberately not a setting.
- **One text, two readers.** The prefilter and the model read the same string — the HTML part stripped by `util/htmlText.ts` when there is one, the plain part otherwise. HTML is preferred because a marketing mail's text/plain part is routinely a "view in browser" stub.
- **Two classes of failure.** A malformed answer on one mail is logged and skipped. A provider that cannot run propagates through `sync/providerFailure.ts`, like triage and filter-suggest. Cost: an extraction whose provider cannot run loses the sync even when triage's provider is fine.
- **A promo row is a code** (#166). An offer needing none produces no row. The prompt says so, and `toRows`, the seam both write paths build rows through, drops any that comes back, so sync and the on-demand run answer the same. `code` stays nullable in the output contract and the column on purpose: a non-nullable field would make a code-less entry a schema violation that fails the whole mail — it is a **skipped entry, never a failed extraction**. Older rows with a null code still exist (see *Rows written before the code rule*).
- **No new sync socket event.** It is a step inside fetch; its failures ride in the sync window's error list.

What is stored is a *suggestion* — `savedAt` null until the user acts — with the expiry (`YYYY-MM-DD`) written at end-of-day UTC through `promoExpiry.ts`, and `merchant` falling back to the sender's display name. The extraction stays absent from `index.ts`, like `promoPrefilter.ts`.

## Asking one message for its promo codes

The message page's Promo Codes panel asks one mail on demand (#165): `POST /messages/:accountId/:gmailMessageId/extract-promos` → `extractPromosForMessageEffect` → `features/message-detail/PromoCodePanel.tsx`. Same task and prompt as the sync's, with three deliberate differences:

- **No prefilter.** A user pressing the button is the decision to spend a call, and the mail the prefilter skipped is precisely when they would press it.
- **Asking again replaces.** It clears the message's unsaved rows before writing (`PromoStore.removeUnsavedForMessage`, rule: `isNull(savedAt)`). A guess never overwrites a decision — the saved row carries the only surviving copy of a mail the save trashed. A run that finds nothing clears too.
- **Both classes of failure reach the caller.** A provider that cannot run surfaces as the usual `ProviderUnavailableError` → 503.

The route is a sibling of `filter-suggest`: it acts on a *message*, and before it runs there may be no promo to name. It takes no body. The panel sits under `TriagePanel` and is always drawn — being askable is the feature. The mutation is not optimistic (its content is unpredictable); it invalidates `["promo-suggestions"]` and reads its own result rather than that cache.

## Promo suggestions above the inbox

A horizontally scrolling row of cards above the message list, under the filter suggestions and the verification-code strip, gone when there is nothing to suggest (#160).

`listPromoSuggestionsEffect` in `services/promoCodes.ts` owns the rules, split with `PromoStore`. Storage's rules are the read model: unsaved only, one account, and the mailbox rule — an unsaved detection whose mail was archived, trashed or removed follows it out (hence `unsaved` joins `messages`). The section's rules: an expired promo is not a suggestion (an unstated expiry is not expired, and the stored instant is end-of-day, so a promo lapsing today shows all day); a repeated code is one card, deduped *before* the cap; `MAX_PROMO_SUGGESTIONS` caps it. A row with no code passes through the dedupe unfolded (legacy rows only). `now` is a parameter so "expired" is assertable. The Promise facade is in `stores/seam.test.ts`'s `SEAMED_SERVICES`. The codes past the cap are reachable on the Promo Codes page (`listSuggestedPromosEffect`, below).

`GET /promo-codes` is its own endpoint and `["promo-suggestions", params]` its own query key, not an array widened onto the listed-message payload: different lifetimes and invalidation, and that payload is sent for every row. Scoping is done by passing the period to the server — the list payload has no bodies and therefore no promos.

Because the key is separate, list invalidation does not reach it: archive, trash and the bulk action name it in `alsoInvalidate` (`api/mutations.ts`), which is what makes the mailbox rule true on screen. The page's suggestions sit under the **same** root — `["promo-suggestions", "all"]` — so the optimistic removal (a `setQueriesData` over the root) and the one `alsoInvalidate` entry cover both lists.

Nothing is shared with the verification-code strip (browser-side regex over subject and snippet). A promo code is deep inside the HTML, so this reads a server-side extraction; cards, not pills; a promo's own expiry is its age rule. The strip stays above the cards — a verification code is worth minutes. Both are hidden in select mode.

`features/promos/promoExpiryLabel.ts` is pinned to UTC — read in a local zone, the stored `…T23:59:59.999Z` would show as the next day east of Greenwich — and answers "No end date" rather than inventing one.

Bun module mocks are process-global, so a suite whose seam is `fetch` inherits whichever `api/client` stub ran last. `promoSuggestionsWiring.test.tsx` restores the real client by importing `"../../api/client.ts?real"` (declared in `vite-env.d.ts`) and re-registering it *spread*, since a module namespace object registers as no replacement at all.

## Saving a promo, and trashing its mail

One button does both (#161), and the **order between the two writes is the feature**: `savePromoEffect` writes the saved state with its denormalised copy of the mail *first*, then calls the same `trashMessageEffect` every other caller uses. A refused trash leaves the promo saved (recoverable); the reverse order could delete the mail and lose the code. This deliberately departs from the apply service's Gmail-first guarantee, and is why it is a core service (`POST /promo-codes/:id/save` validates and delegates). Trash, not permanent delete: deleting needs the full-mailbox scope re-consented by every account, and the local copy is permanent anyway. The copy is taken from the `messages` row.

`trashedThreadId: null` says the trash did not happen. An already-saved row keeps the record it was saved with and only retries the trash.

On screen the card and the row leave on the click and come back together if refused, through `api/messageMutation.ts`'s `optimisticSide` — one more list-shaped cache cancelled, snapshotted, written and rolled back with the message lists. The plan drops every suggestion of that mail. A save whose trash was refused re-reads the lists and says so. `mutations.savePromo.test.ts` covers that branch; the click, removal and refusal are rendered in `promoSuggestionsWiring.test.tsx`.

## The Promo Codes page

`pages/PromoCodesPage.tsx` at **`/promo-codes`**, a top-level route with a sidebar footer entry (#162). Global, not account-scoped — the mailbox is a **column**, never a filter. Being outside `/account` keeps it clear of `App`'s `isAccountScope` redirect.

`listSavedPromosEffect` owns the rules, `now` a parameter. Active is soonest-expiring first, no-expiry last among them; expired sits below, greyed, most recently lapsed first, and is **never** deleted — deletion is always the user's act. Both sorts are stable over the store's order. Nothing is deduped: two saves are two decisions.

Above those sits **Suggested** — every detection nobody acted on, the overflow of the inbox section's cap. `listSuggestedPromosEffect` is the *suggestions* read with no account and no cap; everything else (unsaved, mailbox rule, unexpired, one row per code, newest first) is the same server-side answer. It renders nothing when empty, and the page's empty state waits for all three sections to be empty.

A suggested row has one control, the save, plus copying. No original-mail view (no copy exists until a save writes one), no edit (guesses become corrigible once kept), no remove (that would be a *dismissal*, an act this feature does not have).

`PromoStore.unsaved()` and `.saved()` both answer `PromoCodeWithAccount` — the row plus `accountEmail`, joined in both adapters, because the row shape is what the seam promises. `PromoWorld.account()` hands back `{ id, email }` for the same reason. On `PromoSuggestionFilter` every field is optional: account + window is the inbox, neither is the page.

The list payload omits the copy of the mail (it would send every saved mail's HTML to draw five short fields).

`GET /promo-codes/saved` and `GET /promo-codes/suggested` take no parameters; `["saved-promos"]` is its own key. The page makes **two** requests because a mail leaving the inbox moves the suggestions, an edit moves the saved rows, and only the save moves both — which is why it alone names `["saved-promos"]` in `alsoInvalidate` beside the suggestions root. The save's effect on the saved sections is a re-read, since the section is decided by the server's clock.

`promoCodesPageWiring.test.tsx` renders the page with `fetch` stubbed and unseeded requests refused, and mounts `App` at the route to show the default-account redirect leaves it alone.

## Taking the code, and reading the mail it came from

Neither changes the promo (#163).

**Copy** is `features/promos/CopyPromoCodeButton.tsx`: the code chip *is* the button. No request, no flag, no timestamp — nothing knows whether a code was redeemed, so a "used" mark would lie. Confirmation is local and transient ("Copied"). A browser that refuses the clipboard raises a toast.

**View the original** reads the *copy the save took*, never the `messages` row: `readSavedPromoMailEffect` behind `GET /promo-codes/:id/original`. The save trashed the original and Gmail purges trash after a month, so this is often the only version left. An unsaved promo has no copy and answers the same 404 an unknown id does — a viewer must never draw an empty mail.

`usePromoOriginalMail(id)` is disabled until `ViewOriginalMailButton` opens a dialog; `["promo-original", id]` has `staleTime: Infinity` and nothing invalidates it. `SavedPromoMailBody` renders the stored HTML, falling back to stored text, with **no HTML/Text toggle**. The remote-images preference still applies — the images are still hosted by the sender. The dialog is read-only; the endpoint has no writer.

## Correcting a promo, and removing one

The guesses are editable, the record is not (#164).

`PATCH /promo-codes/:id` edits **all five** extracted fields — locking any subset guarantees the locked one is the field the model got wrong. `UpdatePromoRequest` states the rules: `discount` and `code` cannot be cleared, and the schema is `.strict()`, so a patch naming `subject` or `bodyHtml` is **refused** 400 rather than silently stripped.

`updateSavedPromoEffect` is a patch: an unnamed field is untouched, `null` clears a nullable one. It reads the row back. The expiry crosses as `YYYY-MM-DD` and is written through `promoExpiryInstant` in `promoExpiry.ts`, the same function the extraction uses.

`DELETE /promo-codes/:id` is the only thing that removes a promo row. Both endpoints act on **saved** rows only and answer the same 404 for an unknown id and for an unsaved detection.

`SavedPromoRow` is `SavedPromoReadRow` or `SavedPromoEditRow`, the flag per row so two corrections are independent. The editor replaces the row in place; the account cell stays plain text. `savedPromoDraft.ts` is the pure module between the boxes and the request — the starting draft (the stored instant read as its UTC day), the patch naming only what changed, `null` for an emptied box, and the pre-request save rules.

Neither mutation is optimistic: which section a promo lands in is `listSavedPromos`' rule against the server's clock. Both re-read `["saved-promos"]`; a refusal needs no rollback, a toast explains it. The delete asks first, in place — the row's copy is very often the only one left.

## Rows written before the code rule

A stored `code` of null is only a legacy row (#166 stopped writing them; #168 is the read side). No surface explains it:

- the ledger row draws `—` in its value chip and offers **no copy act**, the way `CodeLedgerRow` leaves the icon off a magic link;
- `PromoCodeRow` on the message page draws its context and no chip;
- `SavedPromoReadRow` puts the table's `UNSTATED` dash in the code cell.

**Nothing hides, drops or breaks such a row** — it is often the only surviving copy of the mail. It still renders, opens its original-mail dialog, and is editable and deletable.

`code` may be corrected but not **cleared** — in `UpdatePromoRequest`, in `PromoFieldsPatch` on both sides of the wire (`code?: string`), and in `promoDraftIsSavable`, which takes the stored promo as well as the draft so a legacy row with no code stays correctable in its other four fields.

## The worp integration

miel can relay a message's PDF attachment to a worp instance for auto-invoice-filing. Its configuration is a runtime setting (#107), split by secrecy: `worp.base_url` in `app_settings`; `worp.api_key` and `worp.extra_headers` in `encrypted_secrets`. `services/worpSettings.ts` hides the split behind one "worp settings" object, `services/encryptedSecrets.ts` stays the only decryptor, and `sendToWorp.ts` the only reader of the plaintext.

The gate is total and up-front: no base URL or no key means `WorpNotConfiguredError` before a socket is opened, answered as `worp_not_configured` (503). That is the fresh-install default; the attachment UI hides the action until the server reports `configured`.

`worp.api_key` is held to the shared `MIN_KEY_LENGTH` (#118), in `UpdateWorpSettingsRequest` and again in the setter (`setSecretEffect`). The empty string is exempt: it means "clear it". `worpSettings.ts` checks before writing anything, so a bad key refuses the whole patch, as an `InvalidWorpSettingsError` with `field: "apiKey"` and the shared `too_short` reason.

`extra_headers` is a generic header-name→value map, not named Cloudflare fields: transport headers for reaching a host behind a proxy (CF Access, Authelia, oauth2-proxy, an mTLS gateway). The UI's "behind Cloudflare Access" shortcut only pre-fills two header names. Header names are validated as HTTP tokens and reserved names refused; `postToWorpIngest` writes `Authorization` last anyway.

`extraHeaders` on the settings PUT is a *patch* (#119): a string sets a header, `null` removes it, an unnamed one is left as stored. The editor only ever sees names and masked hints, so a replacement would make removing one header mean retyping every other secret. `mergeExtraHeaders` in `worpConfig.ts` is the case-insensitive merge, applied inside `encryptedSecrets.ts`. The editor's rules are in `packages/web/src/features/settings/worpHeaderDraft.ts`.

## The Claude Code token

Stored in `encrypted_secrets` under `claude_code.oauth_token`, same AES-256-GCM, same one-decryptor rule: `readSecretEffect` and `readClaudeCodeTokenEffect` are absent from `packages/core/src/index.ts`, and `claude/Claude.ts` imports `services/claudeCodeToken.ts` directly (#109).

That row is the only source; `CLAUDE_CODE_OAUTH_TOKEN` is not read. With no row, callers get `ClaudeTokenMissingError`. Status is the same `{ configured, hint }` as every other secret, and `GET /auth/claude/status` answers from the same service as `GET|PUT|DELETE /settings/claude-code-token`. A store failure fails the read and the status loudly — answering "no token" on a database blip would report a missing credential to an operator who has one.

## The store seam

Services do not build their own queries. The stores (`packages/core/src/stores/contracts.ts`) are narrow `Effect.Tag` services, one per aggregate, each with a Postgres adapter (`stores/postgres.ts`) and an in-memory one (`testkit/stores.ts`, `testkit/mailbox.ts`). Two implementations are what make the seam real (#132).

There are six: `SettingsStore` and `SecretStore` (`app_settings`, `encrypted_secrets`); `MessageStore`, `TriageStore` and `LabelStore` (the mailbox: list rows, triage results, the label catalogue); `PromoStore` (`promo_codes`, with exactly the operations the promo services make). A store spans more than one table where the read model does — the row shape is what the seam promises, not the join that produces it.

The requirement rides in the `R` channel, so the *boundary* answers it: Promise facades call `runWithStores(effect)` (`stores/postgres.ts`), and `AppLive` and the sync entry points provide `StoresLive`. An effect with no store provided does not compile, so a test that forgets to inject gets a type error rather than a connection attempt.

`makeTestStores({ settings, secrets, mailbox })` is what a suite uses: `stores.run(effect)` at the Promise boundary, `stores.provide(effect)` when the Exit is asserted, seeded rows for "already stored", recorded `writes`/`removals` (and the mailbox row arrays) for storage assertions, and `offline = true` for "the database is unreachable". Mailbox rows are seeded with only the columns a test cares about. `testkit/gmail.ts` is a recording `GmailDataAdapter` that can be told to refuse. Write suites against these rather than `mock.module("../db/client")`.

What stays in the services is the part worth testing: the cursor's encoding, which suggestions still count as pending, that a label id from another account names nothing, and that Gmail is told before anything is written locally.

The seam is drawn at the ciphertext: `encrypt`/`decrypt` stay in `services/encryptedSecrets.ts`, so a store sees a blob and never a secret. `stores/seam.test.ts` guards that the seamed services import nothing that talks to Postgres, that no adapter imports `util/crypto`, and that only one adapter ships: nothing outside a test may import the testkit, and neither the barrel nor core's subpath `exports` may name `stores/` or `testkit/`. A production module importing `testkit/stores` would write settings to a Map and lose them on restart with every suite still green.

The contract is written once — `testkit/storeContract.ts` — and run against both adapters: `testkit/stores.test.ts` (Map) and `stores/postgres.dbtest.ts` (real tables).

That Postgres file is named `.dbtest.ts` on purpose and `scripts/test-with-db.sh` runs it by path, in its own process, after the `bun test ./src` sweep. The remaining fakes (filters, logs, GoogleAuth) are `mock.module`, which is process-global and owns `getDb` for every file loaded after it — inside the sweep, "no row yet" would pass with no database behind it, and `mock.restore()` does not undo a module mock. It rejoins the sweep when those aggregates have stores too.

## The app shell

The frame around every page is gousse's `app-shell` registry item, composed once in `packages/web/src/App.tsx`: `AppShell` › `SidebarShell` + `AppMain` › `TopBar` + `AppContent`. The top bar is the layout's. A page fills it through `features/shell/PageTopBar.tsx`, which portals the page's `TopBarStart` / `TopBarTitle` / `TopBarEnd` into the header, so bar content is declared beside the body it belongs to. The collapsed sidebar's open button is the one child the bar contributes itself, so pages draw no `SidebarTrigger`.

That button stays leftmost because `App` gives the bar a slot to portal into rather than the header itself — a portal appends to its container, so portalling straight into the `<header>` put the trigger after the page controls when the sidebar collapsed later. The slot is a `display: contents` div, so `TopBarStart`/`TopBarEnd` are still flex items of the bar (`ml-auto` and the inbox's centred period nav resolve against the header) while DOM order is pinned. The bar widens to `gap-4` while collapsed.

The slot's context is tri-state: `undefined` means no layout above (a page mounted alone in a test) and the content renders in place; `null` means the bar has not attached yet, and nothing renders. `AppContent` is the content column's one scrolling element — `useScrollRestoration` takes that node and the bar watches it — so pages stay free of their own `overflow-y-auto`, and a sticky bar inside a page sticks at `top-0`. `App.test.tsx` renders all of that.

The shell owns no state. The collapsed flag is `App`'s, persisted in `localStorage`; the scroll node rides through a callback ref into state, because the bar renders before the region. The registry's `useAppShell` goes unused.

Below `sm` the same flag drives a drawer: `App` starts it closed there whatever the stored preference says, closes it on every navigation, and does not write the stored flag from that viewport. The inbox's period nav and select button move to `MobileBottomBar` below `md`, and the account switcher shows only its avatar there.

## The compose window

Replying is a floating window (#96): docked bottom-right at `z-[80]`, collapsible to its title bar. `features/compose/*` is the window — `ComposeWindow`, title bar, To/Cc/Subject header, body, footer, plus the pure `recipients.ts` (one text field per address list, parsed but never rewritten under the caret) and `composeWindowState.ts` — and none of it knows a message is being answered. `features/reply/*` is the reply: prefilled recipients and subject (`replyDefaults.ts`), the AI instruction section, and the two mutations. A future blank Compose mounts the same shell with an empty form.

The window's state is derived: `composeWindowMode(intent, draft)` folds intent with "is there anything unsent", so a window holding a draft cannot fall shut. Minimize is exempt — it is an explicit request to keep the draft out of the way. The body is unmounted while minimized, which is safe because `ReplyComposer` controls every field.

To and Cc are editable end to end: `SendReplyRequest` takes optional `to`/`cc`, `services/replyRecipients.ts` decides between what was typed and the default (the sender), and `rfc822.ts` writes a `Cc` header when there is one. Optional because the CLI names neither.

## Acting on a message

What the user did is on screen before the network answers, and undone visibly if the server refuses (#145). `api/messageMutation.ts` owns both halves: a mutation declares `optimistic` for the `["messages"]` lists and `optimisticDetail` for the `["message", …]` query, and the factory cancels, snapshots, writes and rolls back each. The detail plan is separate because it spells the same facts differently — priority lives on the newest triage run, a suggestion is a `status` on that run — while `labels`, which both share, is edited by helpers generic over the carrier. `optimisticDetail` only rewrites a detail already cached.

Archive, trash and the confirmation panel's delete return to the inbox from the click handler, beside `mutate`, not in its `onSuccess`. React-query drops the callbacks passed to `mutate` once their component unmounts, and these always unmount, so archive and trash carry their failure notice on the mutation itself (`announcingFailure` in `api/mutations.ts`). `features/inbox/detailExits.test.ts` counts the exits; `features/message-detail/detailActions.test.tsx` renders them.

Opening a message marks it read (#142): `features/message-detail/useMarkReadOnOpen.ts` fires the same `useSetMessageRead` the toggle uses, optimistic, rolled back silently on refusal. The hook's ref records the message it has *considered*, not the one it acted on: `UNREAD` is read off a cache that refetches and the toggle rewrite, so re-deciding on each sighting would re-fire on a refetch and undo a "Mark as unread". The toggle's suite therefore tests the trip back.

## Labelling the message you are reading

`features/message-detail/AddLabelButton.tsx` and `useAddMessageLabel` (#167). No new endpoint: `POST /messages/:accountId/:gmailMessageId/labels` has always taken both `add` and `remove`. The inbox row reuses this mutation whole (#170).

- **The header's badge row is unconditional** — the trigger always renders, so a message with no labels can be labelled. `MessageLabels` still self-hides.
- **Both optimistic plans, and a notice.** `optimistic` and `optimisticDetail`, so the badge appears on the page and the row before the server answers; `withLabel` leaves an existing label alone. The refusal toast rides on the mutation (`announcingFailure`), because a silent rollback reads as a missed click.
- **One picker.** A label already on the message is listed and marked "Added" rather than hidden.

## The one label picker

`features/labels/LabelPicker.tsx` is the whole of a label chooser; the bulk bar's `BulkLabelPicker` and the message detail's `AddLabelButton` mount it (#169). A face owns its trigger (`renderTrigger`) and the `align` edge its panel hangs from; everything else, closing included, is the picker's — a pick closes the panel and *then* reaches the caller. The panel is anchored in place, not portalled.

- **`offeredLabels.ts` is the rule, and it is pure**: system mailboxes out, sorted by name, case-insensitive substring of the *whole* name (so `Clients/Acme` matches "clients").
- **Four states**: loading, load-failed, no-labels-yet, and filter-matched-nothing. `LabelPickerBody.tsx` chooses between them; the field is drawn only in the branch that has something to narrow.
- **The query lives in `LabelPickerMenu`**, unmounted with the panel, so each open starts unfiltered.
- **The field sits outside the `menu` element** and only the results scroll. It takes the caret on open and leaves Escape to the popover, so one press closes the panel.

The filter is driven through both call sites (`select/bulkLabelWiring.test.tsx`, `message-detail/addLabelWiring.test.tsx`), which is what catches a trigger wired to a picker of its own.

The inbox row is the exception to `renderTrigger`: its panel is placed by the *list*, so it composes `LabelPickerMenu` directly. Both panels share `labelPanel.ts` (width, border, padding, shadow) and everything inside.

## Labelling a message from its inbox row

The row gained an add-label action (#170). Its badges stay read-only — *detaching* is a decision made on the detail page, and the section headers' flag actions still exclude labelling a whole category. The comments in `MessageRowLabels.tsx` and `SectionActions.tsx` say so.

It is `useAddMessageLabel` and the shared picker; what is new is who mounts the picker.

- **One picker for the list.** `RowLabelPickerHost`, mounted by `InboxPage`'s body, holds the open state, panel and mutation. A row contributes a `<button>` (`RowAddLabelButton`) naming its message and handing over the anchor element.
- **The panel is portalled and anchored**, like `FilterSimilarPopover`, and keyed by the row so each open starts fresh.
- **No host above means the trigger renders nothing** — mounting a local panel would be the per-row popover this exists to avoid.
- **The row publishes `data-labelling` while its panel is open** and `MessageRowEndCell` reads it, since the portalled panel takes hover and focus off the row and the trigger would otherwise fade out.
- **It heads `MessageActions`' row variant**: read/archive/delete stay last so columns line up from the right; the detail bar is excluded (its trigger is in the header). The mobile swipe strip gets it for free; the end cell's gradient stop is sized to the button count.

`features/labels/rowLabelWiring.test.tsx` mounts the page for real, so trigger, picker and mutation are proven to agree.

## Selecting messages

Multi-select is one hook — `features/select/useSelection.ts`, account-scoped by construction: the key is `account|item`, and only the account half is ever interpreted (the filters page uses it over filter ids). The category select (#146) is `features/select/CategorySelectButton.tsx` in each section header — the three priorities and untriaged.

What a press does is `toggleManySelection`'s decision, taken against the state it writes; `isSelected` is read in the button only to name it, so a stale render can mislabel but never select the wrong messages. The press also enters select mode (`InboxPage`'s `handleToggleCategory` calls `enterSelectMode` beside `toggleMany`).

The button filters `messages` to the section's own `accountId` (never `messages[0]`'s), and hangs off the same `live &&` the flag actions do, so a header exiting during an account switch carries no select.

## Attachments

Attachments sit *under* the message (#143): `features/message-detail/MessageAttachmentsSection.tsx`, a heading and one `AttachmentRow` per file, rendering nothing when there are none. The header's badge row is labels and suggestions only, and its draw condition has no attachment clause.

The actions are written once: `components/useAttachmentActions.ts` holds the two requests, the shared busy flag and whether worp may be offered (file type *and* worp configured); `components/AttachmentMenuContent.tsx` is the menu both faces open. The inbox row keeps the compact `MessageAttachments` → `AttachmentPill` (capped at three with `+n`); the detail page mounts full-width rows. A new face reuses both.

`api/downloadAttachment.ts` calls `fetch` itself rather than `apiFetch` (it wants the blob and an `<a download>` click), so a suite exercising it stubs `fetch` *and* the client.

## Viewing preferences

The theme and remote-image loading are per-browser (#149) — no schema, endpoint or migration — and share Settings' General card (`features/settings/GeneralCard.tsx`).

`features/preferences/remoteImages.ts` holds the storage key, the default, a reader that treats anything unrecognised as the default, and a `useSyncExternalStore` hook over a listener set, so the settings row and an open message body agree. The default is **show**, unlike Gmail and Apple Mail — a remote image is the standard read receipt, and the product decision is to pay that price by default. That is why the hide path stays; keep it.

In `MessageDetailBody`: under *show* there is no per-message remote-images toggle; under *hide* `stripRemoteImages` blanks the `http(s)` sources and the toggle opts one message in. Inline `data:` and `cid:` images are never stripped. The frame's image `load`/`error` listeners size it once images arrive.

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

## The web DOM harness

`packages/web/bunfig.toml` preloads `src/testing/domHarness.ts`, which registers **happy-dom** and React Testing Library's `cleanup` before any test file loads (#129). Bun shares globals across test files, so a suite assigning `globalThis.window` would decide `window` for every file after it; DOM globals come only from the harness. `src/testing/domHarness.test.ts` guards the wiring and scans suites for a hand-built global.

The window sits on the app's origin and `/app` prefix, so `apiFetch` builds the URL a browser would; main-frame navigation is off with the URL fallback on, so `location.assign` records where a click sent the browser.

Wiring suites render, not read: they mount the components and assert what a user sees, clicks and reads (examples: `gateSteps`, `connectFailureWiring`, `filterSelectionWiring`, `filterMergeWiring`, `components/sectionHeaderPresence.test.tsx`, `features/settings/CredentialsCard.test.tsx`, `credentialErrors.test.tsx`). That is the standard for anything a render can reach — a regex over source asserts a spelling. What is still read as source is what no render answers: the repo's shape (linting, formatting, ci, docs) and copy-wide word sweeps (`uiCopy`), which guard surfaces written later.

Two seams a render stubs. `fetch` is the usual one — the real `apiFetch` then proves the URL and body — and every unseeded request should be refused, so a stray query fails loudly. `api/client.ts` itself is mocked in `gateSteps` only, in the test file's own body, since bun module mocks are process-global.

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
