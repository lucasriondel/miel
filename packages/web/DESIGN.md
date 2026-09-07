# miel — design guidelines

The visual language of the web app, distilled so future changes stay consistent.
Read this before adding or restyling UI. When in doubt, copy an existing pattern
rather than inventing one.

The aesthetic in one line: **warm, paper-like neutrals; one honey accent;
floating rounded surfaces; soft layered shadows instead of hard borders; small
tactile motion.** Everything theme-aware via CSS custom properties.

---

## 1. Color tokens

All color lives in CSS variables on `:root` / `.dark`, defined in
`src/styles/gousse/tokens.css` and mapped onto Tailwind utilities by
`src/styles/gousse/theme.css` — both vendored registry source (§10), no Tailwind
config file involved. `src/index.css` is imported after them and overrides one
token: the accent. **Never hard-code a hex for chrome** — use a token so it
tracks the theme. Raw hex is allowed only for user-data colors (Gmail label
swatches) where the value comes from the API.

Tokens are stored as space-separated RGB triplets so they compose with Tailwind's
slash-opacity syntax (`bg-gousse-ink/90`) and with `rgb(var(--token) / 0.15)` in
hand-written CSS.

| Token | Tailwind | Role |
| --- | --- | --- |
| `--gousse-bg` | `bg-gousse-bg` | App background (warm off-white / near-black) |
| `--gousse-panel` | `bg-gousse-panel` | Raised surfaces: cards, the content column, rows |
| `--gousse-ink` | `text-gousse-ink` | Primary text |
| `--gousse-muted` | `text-gousse-muted` | Secondary text, icons at rest, labels |
| `--gousse-line` | `border-gousse-line` | Hairlines, dividers, subtle hover washes |
| `--gousse-accent` | `*-gousse-accent` | **The** brand accent: honey (`#94640a` light, `#edb64b` dark). Active states, primary actions |
| `--gousse-high` | `*-gousse-high` | High priority (red) |
| `--gousse-medium` | `*-gousse-medium` | Medium priority (amber-gold) |
| `--gousse-low` | `*-gousse-low` | Low priority (green) |
| `--gousse-high-ink` | `text-gousse-high-ink` | High priority **as text** (`#c63021` light, the fill on dark) |
| `--gousse-medium-ink` | `text-gousse-medium-ink` | Medium priority as text (`#9b5c00` light, the fill on dark) |
| `--gousse-low-ink` | `text-gousse-low-ink` | Low priority as text (`#137839` light, the fill on dark) |

The last three are miel's, defined beside the accent override in `index.css` and
given their utilities by an `@theme` block there — a priority is the colour of
the words now rather than a filled pill (#141), and on a light surface the fill
colours are decoration: amber-gold on `--gousse-bg` is about 2:1, which is not a
word anyone reads. Each ink is its fill taken down until it clears 4.5:1 on both
`--gousse-bg` and `--gousse-panel`; on dark the fill already clears it, so the
ink is `var(--gousse-high)` and there is no second value to keep in step.
`src/lib/priorityColors.test.tsx` computes those ratios from the stylesheets, so
a recolour that stops being legible fails there.

The accent is the one token whose value is ours rather than the kit's: the
vendored `tokens.css` ships gousse's orange, and the `:root`/`.dark` blocks at
the top of `index.css` restate it as the landing page's honey — deep on light so
text and focus rings keep contrast, brighter on dark. The priority colors are
untouched — medium really is amber-gold, and reads as a priority, not as brand.

**The prefix stays `gousse-`.** Renaming the tokens to `miel-*` was considered and
rejected: the names are the vendored gousse-ui registry's contract, so the next
`bunx shadcn@latest add @gousse/…` would reintroduce `--gousse-*` in the copied
component and stylesheet source (§10) and we would be renaming forever. The only
`miel-` strings left in the app are the toaster's class names in `index.css` —
class names, not tokens.

**One accent only.** Don't introduce new brand colors. The priority colors are
semantic (triage), not decorative — use them only for priority. Gmail inbox
*categories* carry their own hues (see §6) but that's the single sanctioned
exception, and those hues live in metadata, not scattered across components.

**Which token a priority takes is `src/lib/priorityColors.ts`.** The tokens above
stay the source for the colour *values*, and the fills double as semantic
danger/warning/success elsewhere; the mapping from a `Priority` to the class that
colours it is the other half, and it lives in that one leaf module. Both surfaces
that state a priority — the inbox section header's heading and the detail view's
triage row — read it, so recolouring priority is one edit rather than a hunt
(#140).

**Priority is emphasis, not an object.** No filled priority badge: the section
header colours its own "High priority" heading and the triage row colours the
word beside the reasoning (#141). Two rules come with that. The word is never
replaced by the colour — colour alone cannot carry the distinction — and the
colour used on text is the `-ink` token, never the fill. The untriaged section's
grey pill is not a priority and keeps its shape.

### Alpha conventions

Tints are built by lowering token alpha, not by picking a lighter color:

- Active surface fill: `bg-gousse-accent/15` (or `/14`), text → `text-gousse-ink`, weight → bold.
- Hover wash on neutral rows: `bg-gousse-line/20`–`/40`.
- Hairline divider: `bg-gousse-line/60`–`/70`.

---

## 2. Shadows over borders

Depth comes from **layered, theme-aware shadows**, not solid borders. Four ramps:

| Tailwind | Use |
| --- | --- |
| `shadow-gousse-sm` | Resting cards, the Reply pill |
| `shadow-gousse-md` | Cards that should read as lifted at rest |
| `shadow-gousse-lg` | Hover lift; the bar's trigger and Reply pill once the page is scrolled |
| `shadow-gousse-xl` | Popovers, the highest floating layer |

Borders are used sparingly and always as **hairlines** (`border border-gousse-line`,
often at reduced alpha) to define an edge — never for emphasis. A border + a shadow
on the same element is fine (the Reply pill does this); a heavy border for weight is not.

Shadow values darken automatically in dark mode (the variables swap), so just pick
the ramp by elevation and let the theme handle intensity.

---

## 3. Radius & shape

The app leans **round**. When a shape is in doubt, take the rounder option —
a control that could be `rounded-lg` or `rounded-full` should be `rounded-full`.

- **Pills**: `rounded-full` — top-bar buttons and toggles, **every sidebar row**
  (nav links, label rows, tree rows, the collapse button), and **every control on
  the settings page** (buttons, selects, text inputs, number fields, the segmented
  control and its thumbs).
- **Cards/panels**: `rounded-2xl` for popovers; **settings cards are `rounded-3xl`**.
  A card full of pills needs a generous corner or the surface out-corners its own
  contents.
- **Rows/buttons inside non-pill lists**: `rounded-lg`.
- **Swatches/chips**: `rounded-sm` (label color swatch is `rounded-sm`, 10×10px).

**Concentric radius rule:** a nested element's radius ≈ parent radius − padding.
A `rounded-2xl` popover with `p-1.5` holds `rounded-lg`/`rounded-xl` rows — never
repeat the parent's radius on a child. Mismatched nesting is the #1 thing that
makes a surface feel off.

**Pills are the exception to concentricity**, and the only one: a `rounded-full`
child inside a `rounded-3xl` card reads as correct because a pill has no corner
to disagree with. That's why the settings card went up to `rounded-3xl` instead
of the controls coming down.

### Padding follows radius

A pill eats its own horizontal padding at the ends, so rounding a control means
widening it. When converting `rounded-lg → rounded-full`:

- text inputs: `px-2.5 → px-4`
- narrow/numeric fields: `px-2.5 → px-3.5`, and add `text-center` — an off-centre
  value inside a pill looks broken
- rows in a card: bump the row inset (`px-4 → px-5`) so text clears the corner arc

### The `.settings-surface` scope

These rules predate vendoring: `Button`, `Select` and `Switch` arrived from the
npm package, so their radius could not be changed at the component. The source is
ours now (§10), but the scoping is still what keeps the pill treatment on the
settings page and off the rest of the app — `SettingsPage`'s container carries
`.settings-surface`, and `index.css` overrides radius under that scope:

```css
.settings-surface :is(button, [role="button"]):not(.settings-rail-dot, [role="radio"])
.settings-surface :is(select, input, textarea)
```

Two deliberate opt-outs: the settings rail dots and the segmented control
(`role="radio"`), both of which set their own radius and would otherwise fight
the blanket rule. Add future opt-outs to that `:not()` list rather than
sprinkling `!important`.

**Native `<select>` needs `appearance: none`** — the OS paints the control and
ignores `border-radius` entirely, so the pill only lands once the native
appearance is dropped. That also removes the built-in arrow, so the scope
supplies an inline-SVG chevron as a `background-image`, with a `.dark` variant
(a `url()` can't use `currentColor`, hence the two literal rgb values).

---

## 4. Typography

- Font: system UI stack, `antialiased` + `-webkit-font-smoothing: antialiased`
  applied at `body` (already set — don't re-toggle per component).
- Weights: body `font-medium`, **active/selected `font-bold`**, section labels
  `font-semibold uppercase tracking-wide text-xs text-gousse-muted`.
- Sizes skew small and dense: `text-sm` (13–14px) for rows, `text-xs` (11–12px)
  for metadata/labels, `text-lg`/`font-bold` for the brand and page titles.
- **Tabular numbers** (`tabular-nums`) on anything that updates in place —
  relative timestamps, counts — to prevent width jitter.
- Truncate, don't wrap, in tight chrome: `truncate` on row text; `title=` on the
  full value for hover. Use `text-wrap: balance` on headings, `pretty` on prose.

---

## 5. Motion & interaction

Tactile but restrained. CSS transitions (interruptible) for state; keyframes only
for staged/looping flourishes.

- **Scale on press**: interactive rows/buttons get `active:scale-[0.96]` (rows use
  `0.97`/`0.98` as they're wider). **Never below `0.95`** — it reads as exaggerated.
- **Never `transition: all`.** Always name properties:
  `transition-[background-color,color,transform]`. Tailwind's `transition-transform`
  already covers transform/translate/scale/rotate.
- Standard easing for "reveal" motion: `cubic-bezier(0.2, 0, 0, 1)`; durations
  `150–220ms`. Longer staged sequences live in `index.css` keyframes.
- **Collapsible height** uses the `grid-template-rows: 1fr → 0fr` trick (see
  `.sidebar-children`), not animating `height`/`max-height` to a fixed px.
- `will-change` only for `transform`/`opacity`/`filter`, and only if you actually
  see first-frame stutter. Respect `prefers-reduced-motion` for any looping anim
  (the AI-glow and conic sheens already do).
- Minimum hit area ~40×40px for icon-only controls; extend small visible glyphs
  with padding rather than shrinking the target.

### Signature flourishes (use sparingly, they're brand moments)

- **AI-glow**: rotating rainbow conic-gradient halo behind the Triage pill
  (`.ai-glow` in `index.css`) — reserved for AI/triage actions.
- **Sheen sweep** on the Sync button hover; **pulse glow** while syncing.

Don't spray these around; they mean "AI" / "in progress".

---

## 6. Layout system

- **The frame is gousse's `app-shell`** (`AppShell` › `SidebarShell` +
  `AppMain` › `TopBar` + `AppContent`), composed once in `App.tsx`. Two tones:
  the sidebar sits on `bg-gousse-bg`, the content column on `bg-gousse-panel`
  with a single `border-l` hairline as the seam. The sidebar draws no border of
  its own.
- **Top bar = one flat row** (`TopBar`, `h-14`, bottom hairline), the layout's,
  above the scroll region. Pages fill it through `features/shell/PageTopBar`,
  which portals `TopBarStart` / `TopBarTitle` / `TopBarEnd` into a
  `display: contents` slot `App` renders inside the header — so a page declares
  its bar beside its body and never mounts a bar of its own. The slot, rather
  than the header, is the portal target so the collapsed sidebar's open button
  — the bar's one own child, rendered ahead of the slot — stays leftmost
  whichever order the two mounted in; the bar widens to `gap-4` while collapsed
  so that button and the account switcher's avatar don't clump. Controls on it
  are bare (ghost buttons, the account switcher's trigger): the bar has the
  hairline, so nothing on it carries a pill border. `data-scrolled` still flips
  once the content scrolls, and `SidebarTrigger` and `ReplyButton` read it for
  their lifted shadow.
- **Sidebar** (`Sidebar` + `LabelList`): `w-62`, brand row (`SidebarTitle` as a
  router link) + collapse at top, scrollable nav in the middle, footer
  (`Logs`, `Settings`) pinned. Collapse is to zero width on desktop and a
  translated drawer with a scrim below `sm`; the panel stays mounted, `inert`.
  The drawer starts closed and closes on every navigation; only the desktop
  column's state is persisted.
  The inbox's period nav and select button move to `MobileBottomBar` below
  `md`, where a fixed-height bar has no room to centre them.
- **One scrolling element in the content column**, `AppContent`. The top bar
  watches its `scrollTop` (`scrollNode`) and `useScrollRestoration` saves an
  offset against each history entry from it, so a page that introduces its own
  `overflow-y-auto` would silently break both: the bar would never lift, and
  returning from a message would land at the top. Let the page grow and the
  region scroll. `AppContent` also owns the inset (`px-5 sm:px-6 py-6`), so
  pages carry no horizontal padding; a sticky bar inside a page (bulk actions,
  filter selection) sticks at `top-0`.
- **One exit off a message** (`useReturnToInbox`). The inbox keeps its whole
  scope in the URL — account, `?view`, `?range`, `?label` — and its scroll
  offset against the history entry, so every way off the detail page (Back,
  archive, trash, the confirmation-code delete) has to go back through history
  rather than build an inbox URL. A new action that leaves the page uses the
  same hook; hard-navigating to `/` or `/account/:id` from there resets the
  user's filters to the default account (#94), and `detailExits.test.ts` fails.
- **Popovers** (`PopoverPanel`): `rounded-2xl bg-gousse-panel shadow-gousse-xl`,
  portalled out to escape `overflow` clipping, with click-outside + Escape
  (`usePopover`). Reuse it — don't roll new floating menus.
- **Modals** (`components/modal/Modal`): the top layer (`z-[100]`, above the
  popovers' `z-[70]`) — a `rounded-3xl` panel over a `bg-black/50` scrim,
  portalled to `document.body`, with `role="dialog" aria-modal`, a focus trap
  (`useFocusTrap`) and a background scroll lock (`useScrollLock`). Dismissal is
  opt-in: pass `onDismiss` for Escape + backdrop-click, omit it for a blocking
  dialog like the onboarding gate. The design system ships no dialog yet, so
  this is the one to reuse.
- **The compose window** (`features/compose/ComposeWindow`): the reply/compose
  form as a `rounded-3xl` panel docked bottom-right at `z-[80]` — over the
  popovers it must cover, under the modals that must cover it (#96). It sits on
  `shadow-gousse-xl`, the floating ramp, and its dock layer is
  `pointer-events-none` with the panel taking them back, so the viewport beside
  it stays clickable. Not a modal: nothing is trapped or locked, because the
  page behind it is exactly what a user reads while writing a reply. Its title
  bar is the collapse control, so the window minimizes to that bar with the
  draft intact; the contents separate with hairlines rather than nested cards
  (§3's concentric rule — the window is already the card).

---

## 7. The sidebar row pattern (reference implementation)

The sidebar nav is the canonical example of these principles working together.
Its hue-driven interaction is centralized in `.sidebar-row` (`index.css`) so a
single `--hue` custom property feeds rest/hover/active uniformly:

- Every row is `rounded-full`, so its hover/active fill reads as a pill sitting
  in the sidebar rather than a block filling it (§3).
- `--hue` defaults to `--gousse-accent`; a row overrides it inline with an
  `r g b` triplet to take a different color.
- On hover: `bg: rgb(var(--hue) / 0.12)` + a short left bar (`::before`).
- On active (`data-active="true"` or NavLink's `aria-current="page"`):
  `bg: rgb(var(--hue) / 0.14)`, bold ink, taller left bar; glyph + count adopt
  the hue.
- **Tinted glyph at rest** (`data-tinted="true"`): the glyph carries
  `rgb(var(--hue) / 0.85)` even when idle — used for Gmail inbox categories
  (Promotions=emerald, Notifications=amber, Forums=sky, Social=indigo), whose
  hues live in `SYSTEM_LABELS` metadata (`systemLabels.ts`).

Structure: virtual views (All messages, Filters) → hairline divider → flat list of
mailboxes, all at one level; then a `LABELS` group with the nested, collapsible
user-label tree (`buildLabelTree` + `LabelTreeRow`, collapse state persisted per
account via `useCollapsedLabels`). Icons sit in a fixed slot sized like the label
swatch so every row's text aligns.

---

## 8. Iconography

- **lucide-react**, stroke style, `currentColor` so they inherit text/hue color.
- Row glyphs ~`h-4 w-4`; inline badge icons `h-3.5 w-3.5`.
- Tag the icon `sidebar-glyph` (or equivalent) when it should pick up a row's hue.
- Optical centering: nudge asymmetric glyphs (play triangles, chevrons) rather
  than trusting geometric centering.

---

## 9. Component conventions (React)

These mirror the repo's CLAUDE.md but matter for design work specifically:

- **One component per file**; break long `return`s into named subcomponents.
  The sidebar row, tree row, mailbox row, and list are deliberately separate files.
- Keep **hue/color decisions in data/metadata**, not inline in JSX scattered across
  the tree (e.g. category hues live in `SYSTEM_LABELS`).
- Put interaction CSS Tailwind can't express cleanly (multi-state `--hue`,
  conic gradients, grid-row collapse) in `index.css` under a clearly-commented
  block, keyed by a stable class — don't inline giant `style` objects.
- Respect `strict` TS: no implicit `any`, handle the null/loading/error/empty
  states of every query (`isLoading` / `error` / empty list) like `LabelList` does.
- One exception to the empty state: the **accounts** query. The onboarding gate
  (§6) blocks the whole app until a Gmail account is connected — and, since #111,
  until the provider that triages has a credential — so nothing below it can
  render an empty account list; don't write a "no accounts yet" fallback for it.
  Loading and error still need handling, and the settings accounts card keeps its
  own empty state, since that's where a second mailbox gets added.

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

`app-shell` is the frame around it — `AppShell`, `AppMain`, `TopBar` and its
three parts, `AppContent` — and pulls `sidebar` in as a registry dependency, so
re-adding it refreshes both. It ships no stylesheet and no tokens of its own.
Nothing in it owns state: the collapsed flag and the scroll node are the
consumer's (`App.tsx` holds both, the flag persisted in `localStorage`), which
is why `useAppShell` goes unused here.

The registry items stay router-agnostic: `SidebarItem` and `SidebarTitle` take a
`render` prop, and `src/components/SidebarNavLink.tsx` plus the brand row in
`SidebarHeader.tsx` are the whole of miel's react-router adapter over them. `.sidebar-row` keys its active rules off `aria-current="page"` as well as
`data-active`, so a `NavLink` lights up with no extra wiring.

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
effects carries the keyframes. The miel honey accent override sits after all
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
- [ ] Depth via `shadow-gousse-*`; borders only as hairlines.
- [ ] Concentric radius on nested surfaces; when in doubt, pick the rounder shape.
- [ ] Sidebar rows and settings controls are `rounded-full`; settings cards `rounded-3xl`.
- [ ] Rounding a control widened its padding to match (`px-4`, centred numerics).
- [ ] Active = `accent/15` fill + `font-bold` + `text-gousse-ink`.
- [ ] `active:scale-[0.96]` (never < 0.95); named `transition-*`, never `all`.
- [ ] `tabular-nums` on in-place numbers; `truncate` + `title` in tight rows.
- [ ] lucide icons, `currentColor`, ~`h-4 w-4`.
- [ ] Looping motion respects `prefers-reduced-motion`.
- [ ] Reuse the `app-shell` parts / `PopoverPanel` / `.sidebar-row` instead of new primitives.
- [ ] One component per file; loading/error/empty states handled.
