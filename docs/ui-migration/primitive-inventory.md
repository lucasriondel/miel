# Primitive Inventory — shadcn/ui migration (map #41, ticket #44)

Backbone for the `packages/ui` migration. Every elementary "brick" in `@miel/web`
mapped to a shadcn registry component and a verdict. Per-primitive detail specs
graduate from this table.

**Registry note:** shadcn registry has ~72 components; the ones we target below all
exist (Button, Badge, Spinner, Popover, Dropdown Menu, Avatar, Separator, Switch,
Toggle Group, Tooltip, Empty, Input, Textarea, Native Select, Select, Skeleton,
Sonner). miel's existing `components/ui/dropdown-menu.tsx` is built on the **Base UI**
flavor (`@base-ui-components/react`) — that flavor is the reference for how the rest
get authored. (Which sourcing mechanism — shadcn CLI vs hand-port in the
dropdown-menu style — is deferred fog on the map, not decided here.)

**Verdicts:** `migrate` = becomes a `@miel/ui` primitive · `keep` = app composite,
out of scope this pass · `fold` = delete, replaced by a primitive · `new` = no brick
exists today, introduce a primitive so scattered inline usages route through it.

---

## Findings at a glance

- **Only one real Base UI dependency today:** `menu` (`components/ui/dropdown-menu.tsx`).
  Migration is mostly *introducing* primitives, not replacing existing Base UI ones.
- **No primitive layer exists** for Input / Textarea / Select / Switch / Checkbox /
  Radio / Tooltip / Dialog / Separator — all inlined per call-site.
- **Recurring tokens to fold into primitives:** pill press `active:scale-[0.96]`;
  focus `focus:border-miel-ink focus:outline-none` (text) / `focus:ring-miel-accent`
  (checkbox); floating surface `rounded-2xl border border-miel-line bg-miel-panel
  shadow-miel-xl z-[70]`, enter anim cubic-bezier `(0.23,1,0.32,1)` 200ms.

---

## Inventory table

| Brick (file) | What it is | Impl today | Registry target | Verdict | Notes / behavior to preserve |
|---|---|---|---|---|---|
| `components/Button.tsx` | 4-variant styled button | hand-rolled native `<button>` | **Button** | migrate | `active:scale-[0.96]`, per-variant disabled states, `inline-flex gap-2 rounded-md`. ~9 importers. Many *other* buttons are inline `<button>` (menu items, toggles) — those stay inline for now, not routed through Button this pass. |
| `components/Spinner.tsx` | circular loader, `size` px | hand-rolled `animate-spin` border | **Spinner** | migrate | **~25 importers — most-used brick.** `role="status"` + `aria-label`. Inline `Loader2 animate-spin` in AttachmentPill can later route here. |
| `components/LabelBadge.tsx` | color label pill + remove btn | hand-rolled `<span>`+`<button>` | **Badge** | migrate | inline color via `style` when present else neutral variant; `active:scale-[0.96]`, `shadow-miel-sm`, remove btn `disabled:cursor-progress`. ~4 importers. |
| `components/SystemLabelBadge.tsx` | icon system pill, `iconOnly` | hand-rolled `<span>` + lucide | **Badge** | migrate | responsive `hidden sm:inline` label; uses `title` attr (Tooltip candidate). |
| `components/SuggestedLabelBadge.tsx` | dashed "suggested" pill (span or button) | hand-rolled | **Badge** | migrate | `+`/`?` glyph, `hover:border-solid`, `active:scale-[0.96]`. |
| `features/filters/ActionPill.tsx` | static filter-action pill (6 kinds) | hand-rolled `<span>` | **Badge** | migrate | inset ring `shadow-[inset_0_0_0_1px]`, `line-through` for remove; no interaction. |
| `components/AttachmentPill.tsx` | pill that is a DropdownMenu trigger | uses `ui/dropdown-menu` | Badge + DropdownMenu | keep | app composite (trigger + submenu logic). Consumes Badge + DropdownMenu primitives once they exist. |
| `components/ui/dropdown-menu.tsx` | shadcn wrappers over Base UI `Menu` | **Base UI `menu`** | **Dropdown Menu** | migrate | **Already the reference pattern.** Just *moves* into `@miel/ui` as the seed primitive. Preserve `data-[starting/ending-style]` anim, `data-[highlighted]`, sub-trigger chevron, `DropdownMenuLabel` = plain div. |
| `components/PopoverPanel.tsx` (+`PopoverTitle`) | generic anchored floating panel | hand-rolled portal + `useAnchoredPosition` | **Popover** | migrate | **Load-bearing:** `rAF`-driven enter (opacity+scale+translate), `motion-reduce` reset, `origin-top-left/right` by align, viewport clamp `min(15rem,calc(100vw-2rem))`, `rounded-2xl shadow-miel-xl`. 3 importers. Maps to Base UI Popover/Positioner — verify clamp + anim survive. |
| `components/PriorityMenu.tsx` | priority picker (list of buttons) | hand-rolled portal, no enter anim | **Popover** or **Dropdown Menu** | migrate | active item `bg-miel-accent/20 font-bold`, fixed top/right pos. Decide Popover-list vs Menu in detail spec. |
| `components/FilterSimilarPopover.tsx` | popover w/ textarea + send | hand-rolled portal | Popover + Textarea + Button | keep | app composite. Autofocus, clear-on-close, `⌘/Ctrl+Enter` submit, Spinner while pending. Consumes Popover/Textarea/Button primitives. |
| `components/Avatar.tsx` | img-or-initials circle | hand-rolled `<span>` | **Avatar** | migrate | 1–2 initials from email local-part, gradient fallback `from-miel-accent to-orange-700`, size via className (default 34px). |
| `components/Island.tsx` | rounded-full top-bar cluster | hand-rolled `<div>` | *(no registry equiv)* | keep | reacts to parent `group-data-[scrolled]/bar` shadow. App chrome, stays in web. |
| `components/EmptyState.tsx` | dashed empty state (title/desc/action) | hand-rolled `<div>` | **Empty** | migrate | `border-dashed`, gradient `from-miel-panel to-miel-bg`. **~8 importers.** |
| `components/AllCaughtUp.tsx` | specialized "all caught up" empty | hand-rolled, dup of EmptyState | **Empty** | fold | solid (not dashed) border; duplicates EmptyState layout → fold into Empty primitive (variant) + keep the copy in web. |
| `components/topbar/SegmentedToggle.tsx` | pill segmented control, sliding thumb | hand-rolled, `role="tablist"` | **Toggle Group** or **Tabs** | migrate | **Load-bearing:** thumb geometry measured via `useLayoutEffect` from live `offsetLeft/Width`, spring easing `cubic-bezier(0.34,1.56,0.64,1)` 300ms. Verify measurement approach survives registry component; may stay bespoke if it fights the primitive. |
| `features/settings/ScheduleToggle.tsx` | on/off switch | native `<button role="switch">` | **Switch** | migrate | `aria-checked`, sliding knob translate, track color swap, Spinner while saving. |
| `components/AccountPicker.tsx` | radio group of accounts | `role="radiogroup"` + sr-only radios | **Radio Group** | migrate | checked styling + `active:scale-[0.98]`; loading/error/empty states stay in the app wrapper. |
| `components/MessageRow.tsx` (checkbox) | selection checkbox | raw `<input type=checkbox>` | **Checkbox** | new | `focus:ring-miel-accent`, `sr-only` label. MessageRow itself is a **keep** composite; only the checkbox routes to a primitive. |
| Input sites (ModelPicker, SyncRangeControls, ReplyComposer, FilterSimilarPopover, ReplyDraftView) | raw `<input>`/`<textarea>` | native elements | **Input**, **Textarea** | new | No wrapper exists. Fold recurring `focus:border-miel-ink focus:outline-none` into the primitive. |
| Select sites (IntervalControl, ModelPicker) | native `<select>` | native `<select>`+`<option>` | **Native Select** | new | keep native semantics (out-of-preset extra option, `__custom__` sentinel). Base UI Select (fancy) is optional/later. |
| Dividers (PresenceRow, LogsTable, LogRow, TriagePanel, MessageDetailHeader, BulkActionBar, TopBar, LabelList) | `border-b border-miel-line` | inline Tailwind | **Separator** | new | consolidate the ~8 repeated hand-rolled dividers into one Separator primitive. |
| `title=` hints (LabelBadge, SystemLabelBadge, SuggestedLabelBadge, AttachmentPill) | native tooltip hints | `title` attr | **Tooltip** | new (optional) | No tooltip primitive today. Introducing one is *optional* — flag for the contract ticket whether swapping `title` → Tooltip counts as behavior-preserving or a change. |

---

## Composites that STAY (keep — boundary is explicit)

Out of scope this pass; they only *consume* the new primitives:

- `components/MessageRow.tsx`, `MessageRowActions.tsx`, `MessageActions.tsx`, `MessageLabels.tsx`, `MessageAttachments.tsx`
- `components/Sidebar.tsx`, `SidebarToggleButton.tsx`, sidebar rows
- `components/TopBar.tsx` + all `components/topbar/*` islands (`NavIsland`, `AccountIsland`, `ActionIsland`, `SyncSplitButton`, `TriageButton`, `SyncPeriodPopover`, `WeekNavInline`)
- `components/PrioritySection.tsx`, `UntriagedSection.tsx`, `SectionActions.tsx`, `PresenceRow.tsx`
- `components/MobileBottomBar.tsx`, `MobileSuggestionsBadge.tsx`
- `features/filters/*` rows/cards (`FilterRow`, `ProposedFiltersCard`, `SuggestedFilterRow`, `AccountFiltersSection`, criteria/action tags)
- `features/message-detail/*`, `features/reply/*` composers, `features/select/*` bars, `features/settings/*` managers, `features/logs/*` tables
- `components/Island.tsx` — app-chrome container, no registry equivalent

Custom hand-written CSS in `index.css` (AI conic glows `.ai-glow`/`.filter-glow`,
sidebar hue system, filter cards, sheen/pulse) is **not** a primitive — stays in web.

---

## Graduation seed (for detail-spec tickets)

Each `migrate`/`new` row → one per-primitive detail ticket once the
behavior-preservation contract (#45) lands. Suggested grouping by risk:

- **Low risk (leaf, port ~verbatim):** Spinner, Badge (LabelBadge+System+Suggested+ActionPill), Avatar, Separator, Empty, Dropdown Menu (already Base UI — just moves).
- **Medium:** Button (high fan-out), Input, Textarea, Native Select, Checkbox, Switch, Radio Group.
- **High (load-bearing anim/measurement — verify carefully):** Popover (rAF enter + viewport clamp), SegmentedToggle (live geometry measurement), PriorityMenu (Popover-vs-Menu decision), Tooltip (optional — is it behavior-preserving?).

Open questions to route to the **behavior-preservation contract (#45)**:
1. Is swapping `title=` hints → a Tooltip primitive "behavior-preserving" or a change?
2. Does SegmentedToggle's `useLayoutEffect` geometry survive Toggle Group/Tabs, or stay bespoke?
3. PriorityMenu: Popover-list or Dropdown Menu?
4. Native Select vs Base UI Select — keep native semantics or upgrade?
