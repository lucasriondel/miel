// The in-app OAuth round-trip, end to end through the two routes: `start`
// records where the flow began, the callback resolves the landing page from
// that server-side record alone.
//
// Only the two side-effecting core calls (`exchangeCodeAndProfile`,
// `connectAccount`) are swapped out — the real module is loaded first and
// spread back — so the state store, the consent-URL builder and the redirect
// construction under test are all the real ones, and no Google call or Postgres
// connection is made.
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";
process.env.GOOGLE_CLIENT_ID ??= "test-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
process.env.GOOGLE_REDIRECT_URI ??= "http://localhost:3001/auth/google/callback";
process.env.WEB_ORIGIN ??= "http://localhost:3000";

const WEB = process.env.WEB_ORIGIN;
const ACCOUNT = { id: "acct-1", email: "user@example.com" };

let exchangeError: Error | null = null;
let connectCalls = 0;

const realCore = await import("@miel/core");
mock.module("@miel/core", () => ({
  ...realCore,
  exchangeCodeAndProfile: async () => {
    if (exchangeError) throw exchangeError;
    return {
      grant: { refreshToken: "rt", scopes: ["s"], accessToken: "at" },
      profile: {
        email: ACCOUNT.email,
        displayName: "User",
        avatarUrl: null,
      },
    };
  },
  connectAccount: async () => {
    connectCalls += 1;
    return { ...ACCOUNT, displayName: "User", avatarUrl: null, inserted: true };
  },
}));
afterAll(() => mock.restore());

const { googleOAuthStartRoutes, googleOAuthCallbackRoutes } = await import("./googleOAuth");

const app = new Hono();
app.route("/auth", googleOAuthStartRoutes);
app.route("/", googleOAuthCallbackRoutes);

/** Runs `GET /auth/google/start` and returns the `state` Google would echo. */
async function startFlow(query = ""): Promise<string> {
  const res = await app.fetch(new Request(`http://localhost/auth/google/start${query}`));
  expect(res.status).toBe(200);
  const { url } = (await res.json()) as { url: string };
  const state = new URL(url).searchParams.get("state");
  expect(state).toBeTruthy();
  return state!;
}

/** Follows Google's redirect back into the callback; returns the Location. */
async function callback(query: string): Promise<string> {
  const res = await app.fetch(new Request(`http://localhost/auth/google/callback${query}`));
  expect(res.status).toBe(302);
  return res.headers.get("location") ?? "";
}

beforeEach(() => {
  connectCalls = 0;
  exchangeError = null;
});
afterEach(() => {
  exchangeError = null;
});

describe("GET /auth/google/start", () => {
  test("returns a Google consent URL carrying a state", async () => {
    const res = await app.fetch(new Request("http://localhost/auth/google/start"));
    const { url } = (await res.json()) as { url: string };

    expect(url.startsWith("https://accounts.google.com/")).toBe(true);
    expect(new URL(url).searchParams.get("state")).toBeTruthy();
  });

  test("does not echo the return target back to the browser", async () => {
    const res = await app.fetch(new Request("http://localhost/auth/google/start?return=inbox"));
    const { url } = (await res.json()) as { url: string };

    expect(url).not.toContain("inbox");
  });
});

describe("GET /auth/google/callback", () => {
  test("a connect started from the gate lands on the new account's inbox", async () => {
    const state = await startFlow("?return=inbox");

    const location = await callback(`?code=abc&state=${state}`);

    expect(location).toBe(
      `${WEB}/app/account/acct-1?connected=${encodeURIComponent(ACCOUNT.email)}`,
    );
    expect(connectCalls).toBe(1);
  });

  test("a connect started from settings still lands on settings", async () => {
    const state = await startFlow("?return=settings");

    const location = await callback(`?code=abc&state=${state}`);

    expect(location).toBe(`${WEB}/app/settings?connected=${encodeURIComponent(ACCOUNT.email)}`);
  });

  test("a flow with no declared origin defaults to settings", async () => {
    const state = await startFlow();

    expect(await callback(`?code=abc&state=${state}`)).toContain(`${WEB}/app/settings?connected=`);
  });

  test("an unknown return target falls back to settings, never off-app", async () => {
    const state = await startFlow(`?return=${encodeURIComponent("https://evil.example.com")}`);

    const location = await callback(`?code=abc&state=${state}`);

    expect(location).toBe(`${WEB}/app/settings?connected=${encodeURIComponent(ACCOUNT.email)}`);
  });

  test("a forged state is rejected without connecting anything", async () => {
    const location = await callback("?code=abc&state=forged");

    expect(location).toBe(`${WEB}/app/settings?connect_error=state`);
    expect(connectCalls).toBe(0);
  });

  test("a replayed state is rejected", async () => {
    const state = await startFlow("?return=inbox");
    await callback(`?code=abc&state=${state}`);

    const location = await callback(`?code=abc&state=${state}`);

    expect(location).toBe(`${WEB}/app/settings?connect_error=state`);
    expect(connectCalls).toBe(1);
  });

  test("a Google-side denial is reported on the page the flow started from", async () => {
    const state = await startFlow("?return=inbox");

    const location = await callback(`?error=access_denied&state=${state}`);

    expect(location).toBe(`${WEB}/app/?connect_error=access_denied`);
    expect(connectCalls).toBe(0);
  });

  test("an exchange failure is reported on the page the flow started from", async () => {
    exchangeError = new Error("boom");
    const state = await startFlow("?return=inbox");

    const location = await callback(`?code=abc&state=${state}`);

    expect(location).toBe(`${WEB}/app/?connect_error=exchange`);
  });
});
