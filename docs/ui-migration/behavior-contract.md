# Behavior-Preservation Contract (map #41, ticket #45)

The rules every primitive swap is checked against, so "keep the actual behavior, only
swap the brick" is **verifiable**, not a vibe. Every per-primitive detail ticket
inherits this; the swap plan (#46) sequences against it.

## The bar

**Behavioral parity — API may change.** When a `@miel/ui` primitive replaces a web
brick:

- **User-visible behavior must be identical:** look (pixels), press feel, hover, focus,
  keyboard, a11y semantics, enter/exit animation. This is the hard constraint.
- **The props API may differ** from the old brick where shadcn's is cleaner (e.g. cva
  `variant` on Button/Badge). Call-sites are **rewritten mechanically** to the new API.
- **Verification is by driving the screen** — render the affected view before/after and
  confirm identical behavior. Not "the types compile."

A swap that changes user-visible behavior is **out of contract** and needs explicit
per-swap sign-off (see the ruled cases below — most were ruled *toward* parity).

## Load-bearing behaviors that MUST survive

Inherited from [`primitive-inventory.md`](https://github.com/lucasriondel/miel/blob/main/docs/ui-migration/primitive-inventory.md). A swap that drops any of these fails the contract:

- **Press:** `active:scale-[0.96]` (buttons/pills), `active:scale-[0.98]` (menu items, account rows).
- **Focus tokens:** `focus:border-miel-ink focus:outline-none` (text inputs/textarea),
  `focus:ring-miel-accent` (checkbox).
- **Menu/popover anim:** `data-[starting-style]`/`data-[ending-style]` scale-95+opacity-0
  enter/exit, `origin-[var(--transform-origin)]`, `motion-reduce:transition-none`.
- **Popover (from PopoverPanel):** the rAF-driven enter (opacity+scale+translate),
  `origin-top-left/right` by align, and **viewport clamp** `min(15rem,calc(100vw-2rem))`.
  These are load-bearing — the Base UI Popover swap must reproduce them or stay bespoke.
- **Floating surface:** `rounded-2xl border border-miel-line bg-miel-panel shadow-miel-xl`,
  `z-[70]`, cubic-bezier `(0.23,1,0.32,1)` 200ms.
- **Spinner:** `role="status"` + `aria-label="Loading"`, `border-t-miel-accent`.
- **Switch:** `aria-checked` + sliding knob translate + track color swap.
- **`disabled:cursor-progress`** on in-flight actions (menu items, remove buttons).

## A11y parity — no regression

Base UI gives these for free, but the contract states they must not regress:
keyboard nav, `aria-current`, focus traps in popovers, `aria-hidden` on decorative
glyphs, `role` semantics (`switch`/`radiogroup`/`tablist`/`status`). Driving the
screen with keyboard-only is part of verification.

## Custom CSS the primitives must NOT absorb

These stay in `packages/web/src/index.css` and **wrap or sit beside** primitives; a
primitive must not fight them:

- **AI conic glows** `.ai-glow`, `.filter-glow` (rotating rainbow halos).
- **Sidebar hue system** (`--hue` per row, active bar, glyph/count tint).
- **Filter cards** `.filter-card`, **sheen** sweep, **pulse** glow.

Coordination the contract requires: a primitive that sits inside a glow wrapper must
not clip it (`overflow`), must not steal its stacking (`z-index`), and must keep the
border-radius the glow is squared to. The glows are **app moments, not primitives** —
they never move into `@miel/ui`.

## The 4 inventory questions — resolved

1. **`title=` hints → Tooltip? NO.** A Tooltip (hover-delay popup) is a *behavior
   change* vs an instant native `title`. Under the parity bar, **keep `title=` as-is**;
   **do not build a Tooltip primitive this pass.** (Future opt-in enhancement, separate effort.)
2. **SegmentedToggle → registry Toggle Group? NO — KEEP.** Its sliding thumb is
   measured live via `useLayoutEffect` (`offsetLeft/Width`, spring easing); no registry
   primitive reproduces it, and dropping it fails parity. **Ruled out of scope** — stays
   a web composite (consumes tokens, not migrated). See map Out-of-scope.
3. **PriorityMenu → DropdownMenu.** It's a click-to-open list of mutually-exclusive
   actions = Dropdown Menu semantics. **Reuse the existing DropdownMenu primitive** (the
   Base UI seed). It gains the enter/exit anim it lacks today — an improvement that's
   a11y/keyboard **parity-safe** (allowed: parity is about not *losing* behavior).
4. **Native `<select>` → Base UI Select? NO.** **Keep native semantics** (OS picker,
   `__custom__` sentinel, out-of-preset extra option). Wrap in a thin **Native Select**
   primitive (shadcn has one) for consistent chrome — zero behavior change.

## Verification method (plan-only — defines the method, doesn't run it)

Per swap, the build session:

1. **Typecheck** — `bun run typecheck` clean (catches API-rewrite mistakes).
2. **Drive the affected screen** — render the view(s) that used the old brick; exercise
   the interaction (press, open, focus, keyboard, disabled/in-flight state, dark mode toggle).
3. **Compare against the load-bearing list** above for that primitive.
4. **Dark + reduced-motion** — confirm both themes and `prefers-reduced-motion` behave.
5. Green all four → the swap is in contract. Any user-visible delta not on the
   ruled-changes list (PriorityMenu anim gain) → stop, get sign-off.

## Feeds

- **Per-primitive detail tickets** (graduate now — #45 was the last gate) inherit the
  bar + load-bearing list + the 4 resolutions.
- **Swap plan (#46)** — now fully unblocked — sequences swaps and embeds this
  verification method as the per-step "done" check.
