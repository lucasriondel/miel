import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { APP_BASE_URL } from "@miel/core/appBasePath";

/**
 * The DOM every web test runs in (#129).
 *
 * Registered from `bunfig.toml`'s `[test] preload`, so it happens once per test
 * process and before any file is loaded — a suite gets `document`, `window` and
 * the rest by existing, and no test file sets a global up by hand. That is the
 * point: the stubs those files grew (`globalThis.window = { location: … }`)
 * were process-global in bun, so whichever suite ran last owned the browser
 * environment of the ones after it.
 *
 * The app's own origin, prefix included, so anything that reads the URL —
 * `apiFetch` resolving a path-only `VITE_API_BASE` against the origin, the
 * router's basename — sees what it sees in the browser rather than
 * happy-dom's `about:blank`.
 *
 * Navigation is off and the fallback left on, so `location.assign` sets the URL
 * instead of fetching it: a test can assert where a click sent the browser
 * without the consent screen being requested over the network.
 */
GlobalRegistrator.register({
  url: `http://localhost:3000${APP_BASE_URL}`,
  settings: { navigation: { disableMainFrameNavigation: true } },
});

/**
 * Imported after the registration, not beside it: Testing Library binds
 * `screen` to `document.body` when its module is evaluated, and a static import
 * would be hoisted above the call that creates the document. Hence the dynamic
 * import — the ordering is the whole reason this file exists.
 *
 * `cleanup` empties the registry of what was mounted; without it a suite's
 * second render finds the first one's markup still in the body, and every
 * `getByRole` after that is ambiguous.
 */
const { cleanup } = await import("@testing-library/react");

afterEach(cleanup);
