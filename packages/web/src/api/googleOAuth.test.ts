import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { startGoogleOAuth } from "./googleOAuth";

// `fetch` is stubbed rather than `./client` module-mocked, for the reason
// `filters.hooks.test.ts` gives: a module mock is process-global and owns
// `apiFetch` for every module loaded after it, so whichever suite registered
// one decided what its siblings were exercising — and test files are not
// loaded in a guaranteed order. Going through the real client also proves the
// URL the API actually receives, query string included.
const originalFetch = globalThis.fetch;

const CONSENT_URL = "https://accounts.google.com/o/oauth2/v2/auth?state=abc";

let requested: string[] = [];

// Where the browser ended up. The harness runs with main-frame navigation
// disabled (see `testing/domHarness.ts`), so `location.assign` sets the URL
// instead of fetching it — and the URL is where every test is put back, since a
// suite that left the window on accounts.google.com would change the origin the
// next file's requests resolve against.
const startedAt = window.location.href;
const navigatedTo = () => (window.location.href === startedAt ? [] : [window.location.href]);

function stubFetch(status = 200, body: unknown = { url: CONSENT_URL }) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  requested = [];
  stubFetch();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  window.location.href = startedAt;
});

describe("startGoogleOAuth", () => {
  test("tells the API the flow started from the onboarding gate", async () => {
    const ok = await startGoogleOAuth("inbox");

    expect(ok).toBe(true);
    expect(requested).toEqual([`${startedOrigin()}/api/auth/google/start?return=inbox`]);
    expect(navigatedTo()).toEqual([CONSENT_URL]);
  });

  test("tells the API the flow started from settings", async () => {
    await startGoogleOAuth("settings");

    expect(requested[0]).toContain("return=settings");
  });

  test("defaults to settings when no origin is named", async () => {
    await startGoogleOAuth();

    expect(requested[0]).toContain("return=settings");
  });

  test("reports failure without navigating", async () => {
    stubFetch(500, { error: "nope" });

    expect(await startGoogleOAuth("inbox")).toBe(false);
    expect(navigatedTo()).toEqual([]);
  });
});

// The origin the harness put the window on, read rather than written down: a
// path-only `VITE_API_BASE` resolves against it, so the absolute URL the client
// builds follows whatever `domHarness.ts` registers.
function startedOrigin(): string {
  return new URL(startedAt).origin;
}
