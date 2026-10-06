# The web DOM harness

`packages/web/bunfig.toml` preloads `src/testing/domHarness.ts`, which registers **happy-dom** and React Testing Library's `cleanup` before any test file loads (#129). Bun shares globals across test files, so a suite assigning `globalThis.window` would decide `window` for every file after it; DOM globals come only from the harness. `src/testing/domHarness.test.ts` guards the wiring and scans suites for a hand-built global.

The window sits on the app's origin and `/app` prefix, so `apiFetch` builds the URL a browser would; main-frame navigation is off with the URL fallback on, so `location.assign` records where a click sent the browser.

Wiring suites render, not read: they mount the components and assert what a user sees, clicks and reads (examples: `gateSteps`, `connectFailureWiring`, `filterSelectionWiring`, `filterMergeWiring`, `components/sectionHeaderPresence.test.tsx`, `features/settings/CredentialsCard.test.tsx`, `credentialErrors.test.tsx`). That is the standard for anything a render can reach — a regex over source asserts a spelling. What is still read as source is what no render answers: the repo's shape (linting, formatting, ci, docs) and copy-wide word sweeps (`uiCopy`), which guard surfaces written later.

Two seams a render stubs. `fetch` is the usual one — the real `apiFetch` then proves the URL and body — and every unseeded request should be refused, so a stray query fails loudly. `api/client.ts` itself is mocked in `gateSteps` only, in the test file's own body, since bun module mocks are process-global.
