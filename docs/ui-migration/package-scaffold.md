# @miel/ui Package Scaffold — spec (map #41, ticket #42)

The build/export/consumption shape for the new `packages/ui` workspace package.
Decided against the existing `@miel/core` precedent (which already ships **raw
source**, not a built dist). Spec text only — no code written this map.

## Decision summary

| Question | Decision |
|---|---|
| Distribution model | **Raw `.tsx`/`.ts` source**, consumed directly (Vite + Bun transpile). No dist consumed. Mirrors `@miel/core` (`main`/`types` → `./src/...`). |
| Export surface | **Single barrel** `.` → `src/index.ts`, plus a `./utils` subpath for `cn()`. web imports `{ Button, Badge } from "@miel/ui"`. |
| tsconfig | Extends `tsconfig.base.json`, adds `jsx: react-jsx` + DOM libs (like web). |
| Dependency placement | `@base-ui-components/react`, `clsx`, `tailwind-merge`, `lucide-react` become **@miel/ui deps**; web drops them (gets them transitively via Bun hoist). `react`/`react-dom` are **peerDeps** on @miel/ui (single React from web/root). |
| `cn()` home | Moves to **@miel/ui** (`src/utils.ts`, re-exported from barrel + `./utils`). web's `lib/utils.ts` becomes a one-line re-export shim → zero call-site churn. |
| Turbo | `typecheck` task only (`tsc --noEmit`). Optional `build: tsc` for parity/standalone typecheck, but **no consumer depends on a build** — source is the artifact. |
| Tailwind content | web's config `content` gains `../ui/src/**/*.{ts,tsx}` so @miel/ui-only classes aren't purged. |

## `packages/ui/package.json`

```jsonc
{
  "name": "@miel/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./utils": "./src/utils.ts"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "echo 'no lint configured'"
  },
  "dependencies": {
    "@base-ui-components/react": "1.0.0-rc.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.6.0",
    "lucide-react": "^1.16.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
```

Versions pinned to what web currently uses (verbatim from `packages/web/package.json`).
`@types/react*` in devDeps so @miel/ui typechecks standalone.

## `packages/ui/tsconfig.json`

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["bun"]
  },
  "include": ["src/**/*"]
}
```

Same shape as `packages/web/tsconfig.json` minus web-specific bits. `moduleResolution:
Bundler` (inherited) means web resolves `@miel/ui` via its `exports` map — no `paths`
needed, exactly how web already resolves `@miel/core` today.

## File tree (initial)

```
packages/ui/
  package.json
  tsconfig.json
  src/
    index.ts        # barrel — re-exports every primitive + cn
    utils.ts        # cn() (moved from web/src/lib/utils.ts)
    <primitives>.tsx  # authored per the per-primitive tickets
    # theme (preset.ts / globals.css) lands via the Token-port ticket (#43)
```

## Consumption changes in `@miel/web` (for the build session, not this map)

- `packages/web/package.json`: add `"@miel/ui": "workspace:*"`; remove
  `@base-ui-components/react`, `clsx`, `tailwind-merge`, `lucide-react`
  (now transitive). Keep `react`/`react-dom` (they satisfy @miel/ui's peer).
- `packages/web/src/lib/utils.ts` → `export { cn } from "@miel/ui";` (shim).
- `packages/web/tailwind.config.ts` `content`: add `"../ui/src/**/*.{ts,tsx}"`.
- Primitive imports migrate per the **Swap plan (#46)** — not part of scaffolding.

## Resolution mechanics confirmed against precedent

- **web already imports raw `.ts` from a workspace pkg** (`@miel/core/schemas/syncEvents`
  → `./src/schemas/syncEvents.ts`). Vite/Bun transpile on the fly; no build barrier.
  Same mechanism carries `@miel/ui`.
- Bun workspace hoisting puts the moved deps in root `node_modules`; Vite's default
  resolver finds them. Single React instance preserved via peerDep + web being the
  only real provider.
- `envDir: '../..'` and the dev proxy are untouched — this is package plumbing, not
  Vite server config.

## Unblocks

- **Token port (#43):** the `exports` map is now known — the token-port ticket decides
  whether the preset/globals get their own `exports` entries (e.g. `./preset`,
  `./globals.css`) on top of this skeleton.
- **shadcn CLI vs hand-port (fog → now specifiable):** with a single-barrel,
  raw-source, one-file-per-primitive pkg that has no `components.json`, the sourcing
  question is sharp enough to ticket. See map fog graduation.
