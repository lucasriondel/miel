# The web DOM harness

The rules (render don't regex, stub `fetch`, no hand-built globals) are in `CODING_STANDARDS.md` → *Tests*. This is the machinery behind them.

`packages/web/bunfig.toml` preloads `src/testing/domHarness.ts`, which registers **happy-dom** and React Testing Library's `cleanup` before any test file loads (#129). Bun shares globals across test files, so a suite assigning `globalThis.window` would decide `window` for every file after it. `src/testing/domHarness.test.ts` guards the wiring and scans suites for a hand-built global.

The window sits on the app's origin and `/app` prefix, so `apiFetch` builds the URL a browser would; main-frame navigation is off with the URL fallback on, so `location.assign` records where a click sent the browser.

Rendered wiring suites to copy from: `gateSteps`, `connectFailureWiring`, `filterSelectionWiring`, `filterMergeWiring`, `components/sectionHeaderPresence.test.tsx`, `features/settings/CredentialsCard.test.tsx`, `credentialErrors.test.tsx`. Source-read suites are the repo-shape ones (linting, formatting, ci, docs) and the `uiCopy` sweeps.

Stubbing `fetch` lets the real `apiFetch` prove the URL and body. `api/client.ts` itself is mocked in `gateSteps` only, in that file's own body. A suite whose seam is `fetch` inherits whichever `api/client` stub ran last, so it restores the real client by importing `"../../api/client.ts?real"` (declared in `vite-env.d.ts`) and re-registering it *spread* — a module namespace object registers as no replacement at all. `promoSuggestionsWiring.test.tsx` is the example.
