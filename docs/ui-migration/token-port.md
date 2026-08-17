# Token Port — miel theme → @miel/ui (map #41, ticket #43)

How the miel design tokens move into `@miel/ui` (which **owns** them) while dark mode,
`envDir`, and existing web styling keep working. Values port **verbatim** — only their
home moves. Builds on the package scaffold (#42).

## Decision summary

| Question | Decision |
|---|---|
| Preset contents | **The whole `theme.extend`** from `packages/web/tailwind.config.ts` moves to a `@miel/ui` preset: `colors.miel.*`, `boxShadow.miel-*`, **all** `animation` + `keyframes` (fade-in, slide-up, slide-out, slide-in-right, bounce-subtle, sparkle-twinkle). |
| Globals split | **Only the CSS-var blocks travel.** `@miel/ui/tokens.css` = `:root{--miel-*}` + `.dark{--miel-*}` + `html`/`html.dark` `color-scheme`. Everything else — `body`/`html` base (bg, text, font-smoothing, overscroll) **and** all hand-CSS (`.ai-glow`, `.filter-glow`, sidebar, filter-card, sheen/pulse) — **stays in web's `index.css`**. |
| Preset format | **`.ts`**, typed, exported as an object (not a full `Config` — a partial the app spreads via `presets`). |
| Export mechanics | Add two `exports` entries to `@miel/ui/package.json`: `"./preset": "./src/preset.ts"` and `"./tokens.css": "./src/tokens.css"`. web uses named package imports. |
| darkMode | Stays `darkMode: "class"` in **web's** config; keys off `html.dark`, unaffected by where the vars ship (they're plain CSS custom props). |
| envDir / Vite | Untouched — this is CSS + a config object, not Vite server config. |

## `@miel/ui/src/preset.ts`

```ts
import type { Config } from "tailwindcss";

// Partial preset — web spreads it via `presets: [mielPreset]`.
// `content`, `darkMode`, and `plugins` stay in the CONSUMER's config.
export const mielPreset = {
  theme: {
    extend: {
      colors: {
        miel: {
          bg: "rgb(var(--miel-bg) / <alpha-value>)",
          panel: "rgb(var(--miel-panel) / <alpha-value>)",
          ink: "rgb(var(--miel-ink) / <alpha-value>)",
          muted: "rgb(var(--miel-muted) / <alpha-value>)",
          line: "rgb(var(--miel-line) / <alpha-value>)",
          accent: "rgb(var(--miel-accent) / <alpha-value>)",
          high: "rgb(var(--miel-high) / <alpha-value>)",
          medium: "rgb(var(--miel-medium) / <alpha-value>)",
          low: "rgb(var(--miel-low) / <alpha-value>)",
        },
      },
      boxShadow: {
        "miel-sm": "var(--miel-shadow-sm)",
        "miel-md": "var(--miel-shadow-md)",
        "miel-lg": "var(--miel-shadow-lg)",
        "miel-xl": "var(--miel-shadow-xl)",
      },
      animation: {
        "fade-in": "fadeIn 300ms ease-out forwards",
        "slide-up": "slideUp 300ms ease-out both",
        "slide-out": "slideOut 250ms ease-in forwards",
        "slide-in-right": "slideInRight 180ms ease-out forwards",
        "bounce-subtle": "bounceSubtle 500ms ease-in-out",
        "sparkle-twinkle": "sparkleTwinkle 1.4s ease-in-out infinite",
      },
      keyframes: {
        // fadeIn, slideUp, slideInRight, slideOut, bounceSubtle, sparkleTwinkle
        // — ported VERBATIM from packages/web/tailwind.config.ts (unchanged).
      },
    },
  },
} satisfies Partial<Config>;
```

The `keyframes` bodies copy the current config exactly — no value changes.

## `@miel/ui/src/tokens.css`

```css
/* Design-system token contract. Values ported verbatim from
   packages/web/src/index.css :root / .dark blocks. */
:root {
  --miel-bg: 249 247 244;
  /* ...all --miel-* light values... */
  --miel-shadow-xl: 0 10px 24px rgba(0, 0, 0, 0.12);
}
.dark {
  --miel-bg: 13 13 12;
  /* ...all --miel-* dark values... */
  --miel-shadow-xl: 0 10px 24px rgba(0, 0, 0, 0.6);
}
html { color-scheme: light; }
html.dark { color-scheme: dark; }
```

## `@miel/ui/package.json` exports (extends #42's map)

```jsonc
"exports": {
  ".": "./src/index.ts",
  "./utils": "./src/utils.ts",
  "./preset": "./src/preset.ts",      // added by this ticket
  "./tokens.css": "./src/tokens.css"  // added by this ticket
}
```

> Note for the build session: #42's stated exports map was intentionally minimal
> (barrel + `./utils`). This ticket adds the two theme entries — expected, not a conflict.

## Changes in `@miel/web` (for the build session)

**`packages/web/tailwind.config.ts`** — replace the inline `theme.extend` with the preset:

```ts
import type { Config } from "tailwindcss";
import { mielPreset } from "@miel/ui/preset";

export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../ui/src/**/*.{ts,tsx}",   // scan @miel/ui (from #42)
  ],
  darkMode: "class",             // STAYS in web
  presets: [mielPreset],         // theme now comes from the package
  plugins: [],
} satisfies Config;
```

**`packages/web/src/index.css`** — drop the `:root`/`.dark`/`color-scheme` blocks,
`@import` them from the package instead; keep the body base + all hand-CSS:

```css
@import "@miel/ui/tokens.css";   /* --miel-* vars now ship from the package */

@tailwind base;
@tailwind components;
@tailwind utilities;

/* body/html base (bg-miel-bg, antialiased, overscroll) — STAYS */
/* .ai-glow / .filter-glow / .sidebar-* / .filter-card / sheen / pulse — STAYS */
```

> Import-order note: `@import "@miel/ui/tokens.css"` must precede `@tailwind base`
> (CSS requires `@import` first) so the vars are defined before utilities that read
> them. Verify PostCSS/Vite honors the package `@import` (it resolves via the
> `./tokens.css` export); if Vite's css `@import` resolution balks at the bare
> specifier, fall back to importing the css in `main.tsx` (`import "@miel/ui/tokens.css"`).

## Verification (for the build session — method only, plan-only here)

- Toggle theme: `html.dark` still flips every `bg-miel-*`/`shadow-miel-*` → vars resolve from the package sheet.
- `bg-miel-panel`, `shadow-miel-xl`, `animate-slide-up` etc. still produced by Tailwind (preset + `../ui/src/**` content glob).
- Hand-CSS glows/sidebar unchanged (they stayed in web).
- `envDir: '../..'` + dev proxy still work (untouched).

## Unblocks

- **Per-primitive tickets** can now write `bg-miel-*`/`shadow-miel-*`/`animate-*` in
  `@miel/ui/src/*.tsx` knowing the preset + tokens.css back them.
- **Swap plan (#46)** — one of its two remaining blockers; done once the behavior
  contract (#45) also lands.
