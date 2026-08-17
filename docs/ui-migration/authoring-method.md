# Authoring Method: shadcn CLI vs hand-port → **Hybrid** (map #41, ticket #47)

How primitive source lands in `@miel/ui`. Decision: **use the shadcn CLI as a
source fetcher into a scratch dir, then hand-adapt each component into our decided
layout.** Not a pure-CLI adoption, not a blind hand-copy.

## What the CLI actually does (researched)

- **Base UI is supported.** `shadcn init --base base` selects the Base UI flavor
  (`@base-ui-components/react`) over Radix — the same primitive lib miel already uses
  in `dropdown-menu.tsx`. So CLI output is idiomatically the right foundation.
- **Monorepo aware.** `init --monorepo` scaffolds a shared `packages/ui` and routes
  base components (button, input…) there while app-specific blocks stay in the app.
- **Config-driven paths.** `add` writes to alias paths from a **`components.json`**:
  the monorepo convention is `@workspace/ui/components/*` + `lib/utils` + `ui`/`hooks`
  aliases. Both package and app need matching `components.json` (`style`,
  `iconLibrary`, `baseColor`).
- **Installs deps per component.** `add button` pulls e.g. `class-variance-authority`
  (shadcn Button uses **cva** + a `buttonVariants` helper) and the relevant Base UI
  parts into the target `package.json`.

## Where the CLI fights our scaffold (#42)

| CLI assumption | Our decision (#42) | Conflict |
|---|---|---|
| `components.json` in the package | none — hand-owned pkg | CLI wants a config file we chose not to keep |
| `@workspace/ui/components/*.tsx` + `lib/utils` aliases | **single barrel** `@miel/ui`, `src/*.tsx`, `cn` at `@miel/ui/utils` | import-alias + file-location mismatch on every generated file |
| auto-installs deps into `package.json` | deps hand-declared, pinned to web's versions | CLI would mutate our curated `package.json` (add cva, bump versions) |
| cva + `buttonVariants` in Button | current `Button.tsx` = plain variant record (no cva); `dropdown-menu.tsx` = hand-style, no cva | new dep (`class-variance-authority`) + a different variant idiom than the existing reference |

None of these is fatal, but adopting the CLI wholesale means either (a) reshaping
our scaffold to the CLI's `components.json`/alias world, or (b) constantly fighting it.
We keep the scaffold; we don't keep the CLI in the loop.

## Decision: Hybrid (CLI fetch → hand-adapt)

**Rule for every primitive:**

1. **Fetch** the canonical Base UI source into a throwaway scratch app, *not* the repo:
   `bunx shadcn@latest add <component> --base base` (in a scratch dir with a minimal
   `components.json`). This gives correct, current Base UI source without hand-transcription.
2. **Adapt** into `packages/ui/src/<component>.tsx`:
   - rewrite imports: `@/lib/utils` → `../utils` (our `cn`), component cross-imports → relative.
   - restyle to `--miel-*` tokens in the **`dropdown-menu.tsx` idiom** (the established
     reference: `bg-miel-panel`, `border-miel-line`, `rounded-2xl`, `shadow-miel-xl`,
     `data-[…]` state classes, `cn()`), replacing shadcn's default `bg-background` etc.
   - **cva:** allowed where it earns its keep (Button/Badge variants), but add
     `class-variance-authority` to `@miel/ui` deps deliberately (it's not in the repo
     today) — don't let the CLI add it silently. For simple primitives, keep the plain
     hand-style already used in the reference.
3. **Export** from the barrel `src/index.ts`.
4. Hand-adapted file is the source of truth; the scratch dir is discarded.

**Why hybrid over the alternatives:**
- *Pure CLI:* would force `components.json` + `@workspace/ui/components` aliases +
  auto dep mutation — reverses three scaffold decisions for tooling convenience.
- *Pure hand-port:* re-transcribing Base UI source by hand risks drift from the
  upstream registry and misses a11y details the registry gets right. The CLI fetch
  removes that risk for free.
- Hybrid keeps our curated pkg (barrel, pinned deps, `@miel/ui/utils` `cn`, no
  `components.json`) **and** gets correct upstream source. The existing
  `dropdown-menu.tsx` proves the adapt step is cheap and already our house style.

## Feeds the per-primitive detail tickets

Each per-primitive spec (graduates after the behavior contract #45) inherits this
recipe: *CLI-fetch the Base UI source, adapt to `--miel-*` in the dropdown-menu idiom,
export from the barrel.* The only per-primitive variance is whether cva is warranted
and which Base UI parts to keep.

## New dep implied

`class-variance-authority` — add to `@miel/ui` deps **if** the variant-heavy primitives
(Button, Badge) adopt cva. Decide per-primitive; flagged here so `package.json` (#42)
gains it intentionally, not via a silent CLI install.
