# miel — design guidelines

The visual language of the web app, distilled so future changes stay consistent.
Read this before adding or restyling UI. When in doubt, copy an existing pattern
rather than inventing one. The source of truth for the look is `miel.figcraft`
at the repo root (pages: Main view, Promo codes, Settings, Onboarding, Compose
& Reply, UI System For Miel); this file is what it means for the code.

The aesthetic in one line: **cool slate neutrals; one brand ink for every
primary action and selection; white cards with a hairline and a 12px corner on
a pale canvas; Inter, small and dense; quiet motion.** Everything theme-aware
via CSS custom properties.

---

## 1. Color tokens

All color lives in CSS variables on `:root` / `.dark`. The registry's nine are
defined in `src/styles/gousse/tokens.css` and mapped onto Tailwind utilities by
`src/styles/gousse/theme.css` — both vendored registry source (§10), no Tailwind
config file involved. **Their values are miel's, not the kit's**: `src/index.css`
is imported after those sheets and restates every one of them with the palette
of the design file, then adds miel's own tokens below them and their utilities
in an `@theme` block. **Never hard-code a hex for chrome** — use a token so it
tracks the theme. Raw hex is allowed only for user-data colors (Gmail label
swatches, promo merchant monograms) where the value is data, and for the toast
surface's fixed light text (§6).

Tokens are stored as space-separated RGB triplets so they compose with Tailwind's
slash-opacity syntax (`bg-gousse-primary/10`) and with `rgb(var(--token) / 0.15)`
in hand-written CSS.

| Token | Tailwind | Role |
| --- | --- | --- |
| `--gousse-bg` | `bg-gousse-bg` | The canvas the content column sits on (`#f7f8fa`) |
| `--gousse-panel` | `bg-gousse-panel` | Cards, the reader, popovers, menus (white) |
| `--gousse-ink` | `text-gousse-ink` | Text (`#14202e`) |
| `--gousse-body` | `text-gousse-body` | Long-form body text in the reader (`#2a3644`) |
| `--gousse-muted` | `text-gousse-muted` | Secondary text, icons at rest, counts (`#5e6a78`) |
| `--gousse-subtle` | `text-gousse-subtle` | Tertiary text, the section headers' quiet icons (`#8a96a3`) |
| `--gousse-quiet` | `text-gousse-quiet` | Text on a `fill` surface (the low-priority banner) |
| `--gousse-line` | `border-gousse-line` | Card and column hairlines (`#e2e6eb`) |
| `--gousse-border` | `border-gousse-border` | Control borders: secondary buttons, filled fields (`#dce1e7`) |
| `--gousse-border-strong` | `border-gousse-border-strong` | A control's border under the pointer; disabled glyphs |
| `--gousse-fill` | `bg-gousse-fill` | The sidebar, search and segmented tracks, neutral chips (`#eef1f4`) |
| `--gousse-hover` | `bg-gousse-hover` | Row and secondary-button hover (`#f3f6f9`) |
| `--gousse-field-hover` | `bg-gousse-field-hover` | A filled field under the pointer |
| `--gousse-primary` | `bg-gousse-primary` | **The brand ink**: primary buttons, Compose, Sync, the selected row's bar, active nav at 10% (`#1f2937`; flips light in dark) |
| `--gousse-primary-hover` | `bg-gousse-primary-hover` | Primary under the pointer |
| `--gousse-primary-pressed` | `bg-gousse-primary-pressed` | Primary while pressed |
| `--gousse-on-primary` | `text-gousse-on-primary` | Text on a primary fill (white; near-black in dark) |
| `--gousse-disabled` | `bg-gousse-disabled` | A disabled primary's fill |
| `--gousse-disabled-ink` | `text-gousse-disabled-ink` | Disabled text |
| `--gousse-accent` | `*-gousse-accent` | The registry's active-state colour, restated as the brand ink: `#1f2937` light, `#e8ecf1` dark. The design has no second brand colour for it to be |
| `--gousse-navy` | `text-gousse-navy` | Links and the blue tint's ink (`#1e3a5f`) |
| `--gousse-high` | `*-gousse-high` | High priority and danger (`#d4452c`) — dots, bars, destructive fills |
| `--gousse-medium` | `*-gousse-medium` | Medium priority and warning — amber (`#b8892c`) |
| `--gousse-low` | `*-gousse-low` | Success — the synced dot, a saved toast's check (green) |
| `--gousse-error` | `text-gousse-error` | Error text |
| `--gousse-high-bg` | `bg-gousse-high-bg` | The high-priority banner's tint |
| `--gousse-high-border` | `border-gousse-high-border` | Its rule |
| `--gousse-high-text` | `text-gousse-high-text` | Text on `high-bg` |
| `--gousse-medium-bg` | `bg-gousse-medium-bg` | The medium-priority banner's tint |
| `--gousse-medium-text` | `text-gousse-medium-text` | Text on `medium-bg` |
| `--gousse-tint-blue` | `bg-gousse-tint-blue` | Blue label-chip tint |
| `--gousse-tint-green` | `bg-gousse-tint-green` | Green tint (a saved state) |
| `--gousse-tint-green-ink` | `text-gousse-tint-green-ink` | Its text |
| `--gousse-tint-amber` | `bg-gousse-tint-amber` | Amber tint (an expiring promo) |
| `--gousse-tint-amber-ink` | `text-gousse-tint-amber-ink` | Its text |
| `--gousse-toast` | `bg-[rgb(var(--gousse-toast))]` | The toast surface — the same ink in both themes (§6) |
| `--gousse-high-ink` | `text-gousse-high-ink` | High priority **as text** (`#c63021` light, the fill on dark) |
| `--gousse-medium-ink` | `text-gousse-medium-ink` | Medium priority as text (`#8a6420` light, the fill on dark) |
| `--gousse-low-ink` | `text-gousse-low-ink` | Low priority as text — the muted grey (`#5e6a78`), see below |

**Priority is the colour of the word** (#141), never a filled pill: the inbox's
section headings ("High", "Medium", "Low") and the reader's banner say the level
in words, and colour is the emphasis. A word has to clear 4.5:1 on `--gousse-bg`
and `--gousse-panel`, so each level's ink is the nearest value of its hue that
does — the design's own heading colours (`#d4452c`, `#b8892c`) sit at 4.2 and
3.0. **Low is grey on purpose**: the design draws a low verdict as the absence
of urgency, so its ink is `--gousse-muted`, and its banner the neutral fill.
`src/lib/priorityColors.test.tsx` computes those ratios from the stylesheets, so
a recolour that stops being legible fails there.

**Which token a priority takes is `src/lib/priorityColors.ts`.** The inbox
section heading reads it; the reader's banner reads its sibling
`features/message-detail/priorityBanner.ts` (tint, text, dot per level). The
filled colours appear only as glyphs beside a word: the priority picker's three
bars (`PriorityBars`) and the banner's dot.

**The prefix stays `gousse-`.** Renaming the tokens to `miel-*` was considered and
rejected: the names are the vendored gousse-ui registry's contract, so the next
`bunx shadcn@latest add @gousse/…` would reintroduce `--gousse-*` in the copied
component and stylesheet source (§10) and we would be renaming forever. The only
`miel-` strings left in the app are the toaster's class names in `index.css` —
class names, not tokens.

**One brand colour only.** Don't introduce new ones. Priority colours are
semantic (triage). Gmail inbox *categories* carry their own hues (Updates
`#a15200`, Social `#1967d2`, Forums `#8430ce`, Promotions `#137333`) — the single
sanctioned exception, and those live in `SYSTEM_LABELS` metadata
(`components/systemLabels.ts`, `hue`/`ink`/`inkDark`/`tint`), applied by
`categoryStyle.ts`, not scattered across components.

### Alpha conventions

Tints are built by lowering token alpha, not by picking a lighter color:

- Active nav row / menu item: `bg-gousse-primary/10`, semibold, text `gousse-primary`.
- Hover on a sidebar row: `bg-gousse-primary/5`.
- Category heading band: the category hue at 4% (Updates 7%), via `--tint-head`.

---

## 2. Surfaces: hairlines first, shadows faint

The redesign draws edges with **hairlines** and keeps shadows near-invisible:
a card is white with a `border-gousse-line` hairline and, at most, a 1px shadow at
4%. Real elevation is for things that float: menus and popovers, the row action
toolbar, toasts, the compose window. Four ramps, restated in `index.css` with the
ink colour:

| Tailwind | Use |
| --- | --- |
| `shadow-gousse-sm` | The segmented control's thumb; a lifted chip |
| `shadow-gousse-md` | A hovered card that should read as lifted |
| `shadow-gousse-lg` | Popovers anchored to a control |
| `shadow-gousse-xl` | Menus and the compose window — the highest floating layer |
| `shadow-gousse-window` | Reserved for a full window frame (the design's mockup chrome) |

Card shadows are written as the literal `shadow-[0_1px_2px_rgb(20_32_46/0.04)]`,
and the row toolbar's as `shadow-[0_2px_6px_rgb(20_32_46/0.08)]`. In dark mode
the ramps darken automatically (the variables swap).

---

## 3. Radius & shape

The redesign is **rounded rectangles, not pills**. Pills survive only where a
shape is a tag: label chips, attachment and promo chips, count badges.

- **Cards and panels**: `rounded-xl` (12px) — inbox sections, settings cards,
  promo cards, the reader's blocks (`detailSurfaceClass`).
- **Popovers, menus, toasts, the compose window**: `rounded-xl` / `rounded-[10px]`.
- **Buttons**: `rounded-lg` (8px), 30px tall (`AppButton`); the header's Sync and
  Select are 28px with a 7px corner; Compose is 36px with a 10px corner.
- **Fields**: `rounded-lg`, 28px (search) to 34px (settings, compose).
- **Rows inside a list**: square — they fill the card edge to edge; the open
  message's row carries a 3px ink bar on its left edge instead of a shape.
- **Sidebar rows**: `rounded-lg` (8px), inset by the sidebar's 12px padding;
  the rail's tiles are 40×36 with a 10px corner.
- **Icon buttons**: `rounded-md` (6px) squares (`components/iconButton.ts`).
- **Swatches**: the sidebar label square is 8px with a 2px corner.

**Concentric radius rule:** a nested element's radius ≈ parent radius − padding.
A `rounded-xl` popover with `p-1.5` holds `rounded-lg` items — never repeat the
parent's radius on a child.

---

## 4. Typography

- Font: **Inter** (`@fontsource-variable/inter`, self-hosted, imported in
  `main.tsx`; `--font-sans` in `index.css`), `antialiased` at `body`.
- The scale (UI System › Typography):
  - Display — page titles: 28px bold (`text-[28px] font-bold`).
  - Reader title: 26px bold.
  - Empty-state title: 17px semibold.
  - Section — priority headings: 14px semibold.
  - Body: 14px / 22px regular, `text-gousse-body`.
  - Row: 13px — semibold when unread, medium when read; the sender of a read
    message is muted.
  - UI: 12px semibold — buttons, category headings, dates.
  - Caption: 11px semibold — chips, counts, the sidebar's `LABELS`.
- **Tabular numbers** (`tabular-nums`) on anything that updates in place —
  dates, counts — to prevent width jitter.
- Truncate, don't wrap, in tight chrome: `truncate` on row text; `title=` on the
  full value for hover. Use `text-wrap: balance` on headings.

---

## 5. Motion & interaction

Quiet. CSS transitions (interruptible) for state; keyframes only for staged or
looping flourishes.

- Colour transitions at `150ms`; the segmented thumb slides in `200ms ease-out`.
- **Never `transition: all`.** Always name properties.
- **Collapsible height** uses the `grid-template-rows: 1fr → 0fr` trick (see
  `CategoryGroupBody`), not animating `height`/`max-height`.
- Respect `prefers-reduced-motion` for anything that loops (skeleton pulses,
  spinners, the triage glow).
- Hover-reveal is a refinement for pointers (`pointer-fine:`), never a gate: the
  section headers' actions dim on a mouse, but stay on screen for touch.
- Hit areas: icon buttons are 28px (`sm`) or 32px (`md`); the category heading's
  24px-tall actions extend their target with an `::after` (index.css).

### Signature flourishes (use sparingly)

- **The triage glow**: the rotating rainbow halo behind the Triage button while
  a triage runs (`RainbowGlow`) — reserved for AI work in progress.

---

## 6. Layout system

- **The frame** (`App.tsx`): `AppSidebar` beside a `<main>` column on
  `bg-gousse-bg`. There is **no shared top bar**: every page draws its own
  `PageHeader` (the 28px title, then the page's controls on the same row) above
  its own scroll body, through `PageLayout` (`features/shell/`).
- **The sidebar** (`components/sidebar/AppSidebar`): 236px on `bg-gousse-fill`
  with a right hairline — the collapse toggle, the account switcher card,
  Compose (`C`), the views (Inbox with its unread count, Snoozed with its
  count, Done, Promo codes with the codes to review — and Scheduled, which the
  design does not draw, only while the account has mail waiting to go or a
  send that failed), the account's labels, then Filters, Logs, Settings and
  the sync status at the foot. Collapsed on desktop it is a 72px **rail** of the
  same things as icon tiles (`SidebarRailContext`); below `sm` it is a drawer
  over the page with a scrim, opened from the menu button `PageHeader` draws
  while it is closed (`sidebarToggle.ts`), and closed again on every navigation.
  Only the desktop state is persisted.
- **One scrolling element per column.** `PageLayout`'s body registers itself
  with the layout (`scrollRegion.ts`) and `useScrollRestoration` saves an offset
  against each history entry from it, so a page that adds its own
  `overflow-y-auto` breaks restoration. A sticky bar inside a page sticks at
  `top-0`.
- **List + reader.** An open message is the inbox's *child* route: `InboxPage`
  draws the list column and an `Outlet` beside it, where `MessageDetailPage` is
  the reader (white, 46% up to 644px, a left hairline). The list stays mounted
  and scrolled while messages are read; below `lg` the reader takes the column.
  The reader's toolbar holds the message actions, the Reply split button and a
  pager ("1 of 3", `J`/`K`) through the list's reading order
  (`features/inbox/readingOrder.ts`). Opening another message while one is open
  *replaces* the history entry, so the entry behind the reader is always the
  list.
- **One exit off a message** (`useReturnToInbox`). The inbox keeps its whole
  scope in the URL — account, `?view`, `?range`, `?label`, `?mailbox` — and its
  scroll offset against the history entry, so every way off the reader (the
  close button, Escape, archive, trash, the confirmation-code delete) goes back
  through history rather than building an inbox URL; `detailExits.test.ts`
  fails otherwise.
- **Responsive headers** use container queries: `PageHeader` is an `@container`,
  so the inbox drops its date pill, Select and the period switch by the width
  of its own column (narrow beside the reader), not the viewport's.
- **Popovers** (`PopoverPanel`): white, `shadow-gousse-xl`, portalled out of
  `overflow` clipping, with click-outside + Escape (`usePopover`). Reuse it.
- **Time menus** (`features/time/`): one "when?" menu for snooze and schedule
  send, in the Send-options specimen's shape — label left, the resolved time
  right in 11px muted tabular figures ("Tue 08:00"), a separator, then "Pick
  date & time…", which swaps the list for a date and time form in place. Drawn
  inside a `PopoverPanel` (or the compose window's own menu).
- **Modals** (`components/modal/Modal`): the top layer (`z-[100]`), portalled,
  `role="dialog" aria-modal`, focus trap and scroll lock. Dismissal is opt-in.
- **Toasts** (`MielToaster` + `index.css`): bottom-centre, one dark line each in
  **both** themes (`--gousse-toast`) — the glyph (its colour is the only per-type
  colour), the message, at most one action (`Undo`, `Review`) and the close.
  Archive and trash announce themselves with an Undo wired to unarchive /
  untrash (`api/mutations.ts`, `announcingUndo`).
- **The compose dock** (`features/compose/ComposeDock`): up to three windows
  docked bottom-right at `z-[80]` — over the popovers, under the modals. Not a
  modal: the page behind it is what a user reads while writing. What a window
  opens over itself — the From menu, address suggestions, the schedule form —
  is a `ComposePopover` at `z-[85]`, so it floats over the dock without
  `PopoverPanel` (which sits under it); its shape is the menu's: white,
  `rounded-xl`, `p-1.5`, `shadow-gousse-xl`, `rounded-lg` items.
- **Chips in a window** are pills, as tags are: recipients on `fill`,
  attachments white with a `border` hairline (a spinner and percentage while
  uploading, `high-bg` with the reason when refused), between the body and the
  AI strip.

---

## 7. The inbox list (reference implementation)

The list is where these rules meet, and the pattern every list copies:

- A priority section is a heading row (14px semibold in the level's ink, the
  count in 11px muted, the bulk actions dimmed at the right) above a card.
- Inside the card, **category subgroups**: a 32px heading band tinted with the
  category's hue (`categoryStyle` → `.category-group*` in `index.css`), glyph,
  name and count in the category's ink. Collapsed, the band is 36px and carries
  the run of senders and a chevron as its summary.
- A row is 44px: a 184px sender cell (unread dot + name), the label chips, the
  subject and snippet, the date (`rowDate`: time today, weekday this week, date
  before). On hover the date gives way to the **Row Actions** toolbar — a white
  bordered strip with the priority picker, then label, Gmail, read, archive,
  delete — floated over the row's end.
- Rows are separated by `--gousse-fill` hairlines and hover to `--gousse-hover`.

---

## 8. Iconography

- **lucide-react**, stroke style, `currentColor` so they inherit text/hue color.
- 14px glyphs (`h-3.5 w-3.5`) almost everywhere — rows, buttons, the sidebar;
  16px only in the 32px icon buttons.

---

## 9. Component conventions (React)

These mirror the repo's CLAUDE.md but matter for design work specifically:

- **One component per file**; break long `return`s into named subcomponents.
- **Buttons** are `components/AppButton.tsx` (tones `primary`, `secondary`,
  `ghost`, `danger`; sizes `sm`/`md`/`lg`), which wraps the vendored `Button`
  and restates the design's shape. Icon-only buttons take `iconButtonClass`.
- Keep **hue/color decisions in data/metadata**, not inline in JSX (category
  hues in `SYSTEM_LABELS`, priority in `priorityColors.ts`/`priorityBanner.ts`).
- Put interaction CSS Tailwind can't express cleanly (multi-state `--hue`,
  grid-row collapse, sonner overrides) in `index.css` under a commented block.
- Respect `strict` TS and handle the null/loading/error/empty states of every
  query. Lists show a **skeleton** in the exact geometry of their rows rather
  than a spinner, and an empty list says which empty it is (a search with no
  match, a period with no mail, everything done) with the next useful action.
- One exception to the empty state: the **accounts** query. The onboarding gate
  blocks the whole app until a Gmail account is connected — and until the
  provider that triages has a credential — so nothing below it can render an
  empty account list; don't write a "no accounts yet" fallback for it.

---

## 10. Where primitives come from (the gousse registry)

gousse-ui used to arrive as a private npm package from GitHub Packages
(`@lucasriondel/gousse-ui`). That channel is deprecated and frozen at `0.4.1`, and
the dependency is gone (#74) — with it the root `.npmrc` and the registry token
every install path used to need. The kit now ships as a **shadcn registry**,
served from GitHub Pages with no authentication, which copies source into this
repo instead of resolving a version. `components.json` registers the namespace,
so:

```bash
cd packages/web
bunx shadcn@latest add @gousse/button   # or @gousse/sidebar, @gousse/select, …
```

Vendored source lands in its own directories, kept apart from app code:

| item type | lands in |
| --- | --- |
| `registry:ui` (components) | `src/components/ui/` |
| `registry:lib` (`utils`, `field-chrome`) | `src/lib/gousse/` |
| `registry:file` (`tokens`/`theme`/`effects` css) | `src/styles/gousse/` |

Components take shadcn's default `src/components/ui/`; the registry *libs* keep
their own directory so they don't mix with app helpers. App code imports one
module per primitive through the alias — `import { Button } from
"@/components/ui/button"` — not a barrel.

Vendored files import each other through the `@/` alias — declared in
`components.json`, and resolved by `tsconfig.json`'s `paths` **and**
`vite.config.ts`'s `resolve.alias`. All three must agree.

Once copied, a file is **ours**: edit it in place. There is no version to resolve,
so nothing about a vendored file changes on `bun install` — an upstream gousse-ui
fix arrives only by re-running the add for that item, which overwrites the copy,
and reading `git diff` to see what it took away along with the fix (our pill
radii and `referrerPolicy` live in these files). App code should still reach `cn`
through `src/lib/utils.ts`, the one-line shim that points at the vendored copy.

Every primitive the app renders is vendored: the Base-UI-free half (`avatar`,
`badge`, `button`, `checkbox`, `empty`, `input`, `radio-group`, `rainbow-glow`,
`select`, `sheen`, `sidebar`, `spinner`, `switch`, `textarea`) plus the two that
sit on Base UI (`dropdown-menu`, `separator`).

The settings and onboarding surfaces are vendored too, as composites rather than
bare primitives: `setting-row` (which ships `SettingsCard` beside `SettingRow`),
`saved-flash`, `secret-field`, `provider-mark`, `credential-tile` (which ships
`CredentialStatusPill` and `CredentialGrid`), `model-row`, `steps` and `notice`
(with `NoticeList`/`NoticeListItem`). All eight started here and were pushed *up*
into the registry for `sidebar`'s reason — "pick a provider and give it a key" and
"where am I in this wizard" are shapes every gousse app rebuilds slightly
differently.

They came back **generalized**, which is the part to know when re-adding: the
registry versions are fully controlled and carry no catalogue. `provider` is a
plain `string` rather than miel's `Provider` union, labels and copy are props,
and the hooks stay on our side of the line — `useCredential` in
`features/settings/CredentialTile.tsx`, the settings mutation in
`features/settings/ModelRow.tsx`, the three step ids in
`features/onboarding/StepProgress.tsx`. Those four files are the adapters; the
registry copies below them know nothing about miel.

`sidebar` went the other way: it started here and was pushed *up* into the
registry, because the app shell is the kind of thing every gousse app rebuilds
slightly differently. It is the one primitive that ships a companion stylesheet
(`sidebar-chrome.css`, imported by `index.css`) — the hue-driven row surfaces
need a per-row `--hue` custom property feeding hover fill, the right-edge
active mark and the glyph tint from one value, which Tailwind can't express
cleanly. The
sheet is a registry dependency of the component, so `add @gousse/sidebar` pulls
it automatically; forget it and the rows typecheck fine and render flat.

`app-shell` (the old frame — `AppShell`, `AppMain`, `TopBar`, `AppContent`) and
the `sidebar` primitives stay vendored but **no longer frame the app**: the
redesign's sidebar (a rail when collapsed, the account switcher and Compose in
it) and its per-page headers are miel's own composition in
`components/sidebar/` and `features/shell/`. What still comes from the sidebar
item is its companion sheet: the label tree's `.sidebar-children` collapse.

`dropdown-menu` and `separator` came last, and alone, because they carry
**`@base-ui-components/react@1.0.0-rc.0` — a prerelease**. It is pinned exactly,
as a direct dependency of `packages/web`, so the risk is visible in our own
manifest rather than inherited through gousse-ui. Nothing else depends on it:
dropping or replacing these two later touches no other primitive.

Vendoring is also how fixes arrive: the frozen package predates this document's
pill rules, so the vendored `Button`/`Select`/`Input`/`RadioGroupItem` are the
`rounded-full` + `px-4` versions, and `Avatar` finally carries the
`referrerPolicy="no-referrer"` that Google's avatar CDN requires.

The stylesheets are vendored too. `src/index.css` imports
`./styles/gousse/{tokens,theme,effects,sidebar-chrome}.css` in that order, after
`@import "tailwindcss"` — load-order sensitive, since tokens define the
`--gousse-*` channel vars, theme maps them onto Tailwind theme variables, and
effects carries the keyframes. miel's palette (§1) sits after all
four so it wins. `src/styles/gousseStylesheets.test.ts` compiles the entry with
Tailwind's own engine and asserts both that order and that the sidebar chrome
actually reaches the output. There is no `@source` hint any more: it existed only to make
Tailwind v4 scan `node_modules` for the packaged components' `gousse-*` classes,
and the default scan reaches `src/` on its own.

With that, nothing in this package reads from `@lucasriondel/gousse-ui` — no
symbol, no sheet — and the dependency itself is gone from `package.json` and the
lockfile. `src/publicInstall.test.ts` holds that line: a clone installs, and both
images build, with no registry credential anywhere in the environment.

---

## Quick checklist for new UI

- [ ] Colors are `gousse-*` tokens (or API-supplied data colors) — no chrome hex.
- [ ] Cards are white, `rounded-xl`, a `border-gousse-line` hairline; shadows only on floating layers.
- [ ] Buttons are `AppButton`; icon buttons `iconButtonClass`; pills only for chips.
- [ ] Concentric radius on nested surfaces.
- [ ] Active = `bg-gousse-primary/10` + semibold; primary actions in the brand ink.
- [ ] Inter at the documented sizes; named `transition-*`, never `all`.
- [ ] `tabular-nums` on in-place numbers; `truncate` + `title` in tight rows.
- [ ] lucide icons, `currentColor`, 14px.
- [ ] Looping motion respects `prefers-reduced-motion`.
- [ ] Reuse `PageLayout`/`PageHeader`, `PopoverPanel` and `AppButton` instead of new primitives.
- [ ] One component per file; loading/error/empty states handled.
