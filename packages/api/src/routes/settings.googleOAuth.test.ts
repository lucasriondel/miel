// /settings/google-oauth — the Google client entered in the app (onboarding's
// Google step). Against the real stores: the route is thin, and what matters at
// this boundary is that the secret never comes back, a bad redirect URI is a 400
// naming the field, and a clear puts the environment's client back in effect.
import { afterAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

const { settingsRoutes } = await import("./settings");
const { errorHandler } = await import("../middleware/error");

const app = new Hono();
app.route("/settings", settingsRoutes);
app.onError(errorHandler);

const call = (method: string, body?: unknown) =>
  app.fetch(
    new Request("http://localhost/settings/google-oauth", {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

const SECRET = "route-test-client-secret";

// Leave the install as it was found: the next suite reads the client in effect.
afterAll(async () => {
  await call("DELETE");
});

describe("/settings/google-oauth", () => {
  test("refuses a redirect URI that is not the callback, naming the field", async () => {
    const res = await call("PUT", {
      clientId: "route-test.apps.googleusercontent.com",
      clientSecret: SECRET,
      redirectUri: "https://miel.example.com/somewhere",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "invalid_google_oauth_config",
      field: "redirectUri",
      reason: "wrong_callback_path",
    });
  });

  test("saves a client, answers it as the database's, and never the secret", async () => {
    const res = await call("PUT", {
      clientId: "route-test.apps.googleusercontent.com",
      clientSecret: SECRET,
      redirectUri: "https://miel.example.com/api/auth/google/callback",
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    expect(JSON.parse(text)).toMatchObject({
      configured: true,
      source: "database",
      clientId: "route-test.apps.googleusercontent.com",
      redirectUri: "https://miel.example.com/api/auth/google/callback",
    });

    const read = await (await call("GET")).json();
    expect(read).toMatchObject({
      source: "database",
      clientId: "route-test.apps.googleusercontent.com",
    });
    expect(JSON.stringify(read)).not.toContain(SECRET);
  });

  test("a clear puts the environment's client back in effect", async () => {
    const res = await call("DELETE");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).not.toBe("database");
  });
});
