// `GET /auth/google/config` — whether this server can start an OAuth flow at
// all (#120). A file of its own because it is the one route here that wants the
// three GOOGLE_* variables *unset*, and the round-trip test next door sets them
// once at module load for every case in it.
import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

const { googleOAuthStartRoutes } = await import("./googleOAuth");

const app = new Hono();
app.route("/auth", googleOAuthStartRoutes);

const VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"] as const;
const saved = Object.fromEntries(VARS.map((name) => [name, process.env[name]]));

function setEnv(values: Partial<Record<(typeof VARS)[number], string>>) {
  for (const name of VARS) {
    const value = values[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

const ALL = {
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_REDIRECT_URI: "http://localhost:3001/auth/google/callback",
};

async function config() {
  const res = await app.fetch(new Request("http://localhost/auth/google/config"));
  expect(res.status).toBe(200);
  return (await res.json()) as { configured: boolean; missing: string[]; source: string | null };
}

afterEach(() => {
  for (const name of VARS) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("GET /auth/google/config", () => {
  test("reports configured with all three variables set", async () => {
    setEnv(ALL);

    expect(await config()).toMatchObject({ configured: true, missing: [], source: "environment" });
  });

  test("names every variable that is unset", async () => {
    setEnv({});

    expect(await config()).toMatchObject({ configured: false, missing: [...VARS], source: null });
  });

  test("an empty value counts as unset, not as a client id of ''", async () => {
    setEnv({ ...ALL, GOOGLE_CLIENT_SECRET: "" });

    expect(await config()).toMatchObject({ configured: false, missing: ["GOOGLE_CLIENT_SECRET"] });
  });

  // The client id and the redirect URI are not secrets — both travel in every
  // consent URL, and the app's Google step shows them back — but the secret is,
  // and an environment one has no stored hint to show either.
  test("never sends the client secret", async () => {
    setEnv({
      GOOGLE_CLIENT_ID: "sentinel-client-id",
      GOOGLE_CLIENT_SECRET: "sentinel-secret",
      GOOGLE_REDIRECT_URI: "http://sentinel.example/auth/google/callback",
    });
    const res = await app.fetch(new Request("http://localhost/auth/google/config"));

    const body = await res.text();
    expect(body).not.toContain("sentinel-secret");
    expect(JSON.parse(body)).toMatchObject({ clientId: "sentinel-client-id", secretHint: null });
  });

  test("is read at use-time, so setting the variables needs no new process", async () => {
    setEnv({});
    expect((await config()).configured).toBe(false);

    setEnv(ALL);
    expect((await config()).configured).toBe(true);
  });
});
