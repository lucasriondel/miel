# Swap Plan & Sequencing (map #41, ticket #46)

The ordered, low-risk route a build session follows to replace web's bricks with
`@miel/ui` primitives — big-bang avoided, web green at every commit. Final spec
section; builds on the scaffold (#42), token port (#43), inventory (#44), authoring
recipe (#47), and behavior contract (#45).

## Coexistence policy: **atomic per brick**

Each brick migrates as **one self-contained commit**. Old and new never coexist for a
given brick. web typechecks + runs green at every commit → easy per-primitive review
and revert.

## The repeatable per-primitive recipe

For each primitive, one commit:

1. **Author** in `@miel/ui/src/<name>.tsx` — `bunx shadcn add <c> --base base` into a
   scratch dir, adapt to `--miel-*` in the `dropdown-menu.tsx` idiom (authoring recipe,
   #47). Export from the barrel `src/index.ts`.
2. **Swap** every web call-site to `import { X } from "@miel/ui"`, updating props to the
   new API where it changed (behavioral parity, not API parity — #45).
3. **Delete** the old brick file from `packages/web/src`.
4. **Verify** per the contract (#45): `bun run typecheck` → drive the affected
   screen(s) → check the load-bearing list for that primitive → dark + reduced-motion.
5. **Commit** — `feat(ui): migrate <Primitive> to @miel/ui`.

Per-primitive detail specs are written *inline* at step 1 (they're mechanical now — all
decisions made); no separate spec tickets.

## Commit 0 — scaffold (prerequisite, no brick swap)

Stand up the package before any primitive: `packages/ui` skeleton (#42) +
`preset.ts`/`tokens.css` (#43), web wired (`@miel/ui` dep, tailwind `presets:` +
content glob, `index.css` `@import`, `lib/utils.ts` shim). **`cn()` moves here.**
Verify: web builds + themes unchanged. This commit changes zero components — pure plumbing.

## Sequence (dependency- and risk-ordered)

Ordering rule: **leaf/low-fan-out and low-risk first**, shared deps before dependents,
the already-Base-UI seed early, load-bearing/high-risk last.

| # | Primitive | Fan-out | Tier | Notes |
|---|---|---|---|---|
| 0 | **Scaffold + tokens + `cn`** | — | — | plumbing; web green, components untouched |
| 1 | **DropdownMenu** (seed) | 1 (AttachmentPill) | low | already Base UI — **move** `ui/dropdown-menu.tsx` into `@miel/ui` ~verbatim. Lowest risk, establishes the pattern in-package. |
| 2 | **Spinner** | ~25 | low | **highest fan-out but trivial** — do early to prove the swap mechanics at scale; near-verbatim port. |
| 3 | **Separator** | ~8 dividers | low | `new` — consolidate the repeated `border-b border-miel-line` dividers. |
| 4 | **Badge** | ~4 (Label) +System/Suggested/ActionPill | low | folds 4 pill bricks (LabelBadge, SystemLabelBadge, SuggestedLabelBadge, ActionPill) onto one Badge (cva variants). Watch the `style`-based inline colors on LabelBadge. |
| 5 | **Avatar** | 1 | low | port initials/gradient logic verbatim. |
| 6 | **Empty** | ~8 | low | `EmptyState` → Empty; **fold** `AllCaughtUp` as a variant (keep its copy in web). |
| 7 | **Button** | ~9 imports (+ inline `<button>`s stay inline) | med | high-ish fan-out; cva variants (primary/secondary/ghost/danger). Preserve `active:scale-[0.96]` + per-variant disabled. Only the 9 `Button.tsx` importers swap; hand-rolled inline `<button>`s are **not** in scope this pass. |
| 8 | **Input** / **Textarea** | ~5 sites | med | `new` — fold `focus:border-miel-ink focus:outline-none`. Sites: ModelPicker, SyncRangeControls, FilterSimilarPopover, ReplyComposer, ReplyDraftView. |
| 9 | **Native Select** | 2 | med | `new` — styled native `<select>`; **keep** `__custom__` sentinel + out-of-preset option (#45). IntervalControl, ModelPicker. |
| 10 | **Checkbox** | 1 (MessageRow) | med | `new`; `focus:ring-miel-accent`. MessageRow stays a composite — only the checkbox routes to the primitive. |
| 11 | **Radio Group** | 1 (AccountPicker) | med | `new`; preserve `role=radiogroup` + sr-only radios + `active:scale-[0.98]`. |
| 12 | **Switch** | 1 (ScheduleToggle) | med | `new`; `aria-checked` + sliding knob + Spinner-while-saving. |
| 13 | **Popover** | 3 (PopoverPanel) + PriorityMenu | **high** | **last — most load-bearing.** Base UI Popover must reproduce the rAF enter + `origin-*` + **viewport clamp** `min(15rem,calc(100vw-2rem))` or PopoverPanel stays bespoke (contract #45). Then **PriorityMenu → DropdownMenu** (reuse #1, gains anim — parity-safe). FilterSimilarPopover + AttachmentPill are composites that just consume it. |

**Not migrated (out of scope / keep):** SegmentedToggle (ruled out — live-geometry
thumb), all feature composites (MessageRow, Sidebar, TopBar islands, PrioritySection,
FilterRow…), all hand-CSS (glows/sidebar/filter). No Tooltip (title stays).

## Call-site swap mechanics

- **Import path:** `../Button`, `../../components/Spinner`, etc. → `@miel/ui`. Mostly
  find/replace on the import specifier; props edits are manual where the API changed
  (Button variants, Badge). Spinner/Avatar/Separator are near-mechanical.
- **Watch-outs flagged from the inventory:**
  - **Badge** — LabelBadge passes inline `style` colors when present; the Badge API must
    keep an escape hatch for arbitrary color, not only token variants.
  - **Button** — the ~9 importers may pass local `className` extensions; `cn()` merge
    must preserve them.
  - **Popover** — the 3 PopoverPanel importers rely on the anchored-position hook +
    portal; verify the Base UI Positioner covers every anchor case before deleting
    `useAnchoredPosition`.

## Definition of done (what the build session hands back)

- All **in-scope** primitives live in `@miel/ui`, exported from the barrel.
- web imports them; **old brick files deleted**; `cn()` + tokens owned by `@miel/ui`
  (web's `lib/utils.ts` is a shim, `index.css` `@import`s the package tokens).
- `bun run typecheck` clean across packages; each affected screen driven green in
  **both themes** + reduced-motion (contract #45).
- SegmentedToggle + all composites + hand-CSS untouched and still working.
- No behavior change beyond the one ruled exception (PriorityMenu gains an enter anim).

## Map status after this ticket

Resolving #46 leaves **no open decisions** — the way to the destination (a hand-off-ready
migration spec) is clear. Remaining fog (preview/dev harness, extraction-out) is
post-hand-off and off the route. Map complete.
