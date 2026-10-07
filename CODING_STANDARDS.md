# Coding standards

How code is written in this repo. Read before writing or reviewing code. `CLAUDE.md` is the map; subsystem rules live in the docs it points to.

## Architecture

- **One door out of core.** Every public export lives in `packages/core/src/index.ts`; a new service, schema or adapter is exported there, and other packages import it from there. Modules that hand out plaintext secrets (`readProviderCredentialEffect`, `readSecretEffect`, `readClaudeCodeTokenEffect`) and the store/testkit modules stay out of it on purpose.
- **Thin routes.** An API route in `packages/api/src/routes/*` validates shape with Zod and delegates to a core service; business logic lives in the service, so the CLI and the scheduler get the same rule the route does.
- **One adapter per external system.** Google is reached through the Effect services in `packages/core/src/google/*`, an AI provider through `claude/Claude.ts`. They return typed results and fail with the `Data.TaggedError`s in `errors.ts`; everything else consumes those types and leaves raw responses and stdout to them.
- **Zod at every edge** — env, API I/O, and anything parsed out of a model or Gmail.
- **Stores, not queries.** A service reads and writes through the `Effect.Tag` stores in `packages/core/src/stores/contracts.ts`; the requirement rides in `R` and the boundary provides it. Mechanics: `docs/agents/store-seam.md`.
- **A taxonomy decides, not the caller.** When several call sites must agree on a classification (e.g. "provider unavailable"), the predicate and the tag set live in `errors.ts` and callers share one combinator.

## React

- **One component per file.** Break a long `return` into named subcomponents.
- Keep hue and colour decisions in data, interaction CSS Tailwind cannot express in `index.css` under a commented block. Design rules: `packages/web/DESIGN.md`.
- `AppContent` is the one scrolling element; pages add no `overflow-y-auto` of their own (`packages/web/docs/app-shell.md`).

## Vendored UI (gousse-ui)

UI primitives come from **gousse-ui**, consumed as a **shadcn registry**, not as an npm package. `packages/web/components.json` points the `@gousse` namespace at `https://lucasriondel.github.io/gousse-ui/r/{name}.json` (public, no auth) and holds the `@/` aliases the copied files land under — components in `packages/web/src/components/ui/`, registry libs in `src/lib/gousse/`, the three stylesheets in `src/styles/gousse/`. Import one module per primitive through the `@/` alias (`@/components/ui/button`), never a barrel. `bun install` needs no credentials of any kind.

The maintenance consequence: **vendored components never update through `bun install`** — there is no version to resolve, and a copied file is ours. An upstream gousse-ui fix reaches miel only when someone re-runs the add for that item and reviews the resulting diff:

```bash
cd packages/web
bunx shadcn@latest add @gousse/button   # overwrites the vendored copy in place
git diff src/components/ui/button.tsx   # review: local edits are yours to keep or re-apply
```

Fix a primitive upstream in gousse-ui and re-add it, because a local edit is overwritten by the next re-add. `packages/web/DESIGN.md` §10 lists which primitives are vendored, the pinned Base UI prerelease two of them need, and the stylesheet load order.

## Linting

**oxlint** is the linter: one `lint` script per package (`oxlint -c ../../.oxlintrc.json .`), fanned out by turbo as `bun run lint`, with the single config `.oxlintrc.json` at the repo root (a root devDependency). `.oxlintrc.json` is JSONC — every rule turned off carries a comment on the line above saying why.

Two categories are errors: **correctness** and **suspicious**. Every category stays enabled. The TypeScript, unicorn, oxc, **react**, **react-hooks** and **jsx-a11y** plugins are on repo-wide; the UI plugins are listed globally rather than under an `overrides` entry because oxlint resolves `categories` against the base plugin set only — a plugin added inside an override contributes nothing unless each rule is named there by hand.

Three rules are narrowed in config, each with its reason inline: `react/react-in-jsx-scope` (off, React 19), `eslint/no-underscore-dangle` (allows `_tag` plus the two `_reset*ForTests` hooks), and `jsx-a11y/label-has-associated-control` (told which gousse-ui components render a native control). Fix findings rather than silencing them; a call-site exemption is `// oxlint-disable-next-line <rule> -- <reason>`, and the `--` reason is mandatory and test-enforced.

The vendored gousse-ui source (`packages/web/src/components/ui/**`, `packages/web/src/lib/gousse/**`) is exempt from oxlint for the reason it is exempt from formatting: `bunx shadcn@latest add @gousse/<item>` overwrites those files from upstream, so a fix applied there is undone by the next re-add. The generated `packages/landing-page/src/routeTree.gen.ts` is exempt too. `packages/web/src/linting.test.ts` guards all of this, including that the ignore patterns match real files.

`unicorn/no-array-sort` steers `.sort()` onto `Array#toSorted`, which is why `tsconfig.base.json` sets `"lib": ["ES2023"]` (types only; `target` stays ES2022).

## Formatting

**oxfmt** is the only formatter: a `format` / `format:check` pair in every package, run by turbo — `bun run format` rewrites, `bun run format:check` verifies (CI's). Root devDependency; the one config is `.oxfmtrc.json` (defaults plus the ignore list).

The scripts pass `"**/*.{ts,tsx}"` rather than `.` deliberately: JSON, Markdown and CSS here have other owners (`bun add` rewrites `package.json`, `drizzle-kit generate` rewrites `packages/core/drizzle/meta/*.json`), and widening the glob means fighting those tools.

`.oxfmtrc.json` exempts the vendored gousse-ui source — `packages/web/src/components/ui/**` and `packages/web/src/lib/gousse/**` — because `bunx shadcn@latest add @gousse/<item>` overwrites them in place, and formatting them would bury every upstream re-add under whitespace noise. The generated `packages/landing-page/src/routeTree.gen.ts` is exempt too. `packages/web/src/formatting.test.ts` guards all of this.

## Migrations

A migration is two files: `packages/core/drizzle/NNNN_*.sql` (what the migrator applies) and `packages/core/drizzle/meta/NNNN_snapshot.json` (the schema state it left, which `drizzle-kit generate` diffs the *next* change against). Nothing at runtime reads a snapshot, so the two can drift silently — and a stale snapshot makes the next `generate` re-create objects that already exist (#122).

So: `bunx drizzle-kit generate` from the repo root, which writes both. A hand-written migration (a data rewrite like `0010`) still needs its snapshot written by hand: the previous snapshot plus that migration's effect, chained by `prevId` → the predecessor's `id`. `packages/core/src/db/migrationSnapshots.test.ts` guards the journal, SQL and snapshots listing the same migrations, the `prevId` chain, and the newest snapshot matching `schema.ts`.

## Tests

- **Render, don't regex.** Anything a render can reach is tested by mounting it and asserting what a user sees, clicks and reads; a regex over source pins a spelling, breaks on a rename and passes on a component wired to the wrong thing. Source is read only for what no render answers: the repo's shape (lint, format, CI, docs) and copy-wide word sweeps that guard surfaces not written yet.
- **Inject at the seam.** Core suites use `makeTestStores` and `testkit/gmail.ts` (`docs/agents/store-seam.md`); AI calls go through the one `Claude` tag with `testkit/claude.ts` (`docs/agents/ai-providers.md`); web suites stub `fetch` and refuse every unseeded request so a stray query fails loudly.
- **Module mocks are process-global.** A bun `mock.module` decides that module for every file loaded after it and `mock.restore()` does not undo it, so reach for a seam first; a suite that does mock registers its own in its own body.
- **Globals come from the harness.** `@miel/web`'s DOM is preloaded by `src/testing/domHarness.ts`; a suite builds no `globalThis.window` of its own (`packages/web/docs/testing.md`).
- **Derive, don't restate.** A test that checks docs or copy reads the fact from its source (the CI workflow, `components.json`, `claudeUsage.ts`) so the prose fails when the thing it describes changes.
