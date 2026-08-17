import { z } from "zod";
import { DEV_GOOGLE_REDIRECT_URI } from "./googleOAuthSetup";
import { createDebug } from "./util/debug";

const debug = createDebug("env");

const isProd = process.env.NODE_ENV === "production";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  CLAUDE_BIN: z.string().default("claude"),
  // No CLAUDE_CODE_OAUTH_TOKEN here on purpose, and no ANTHROPIC_API_KEY (#104):
  // every AI credential is a runtime secret stored encrypted in
  // `encrypted_secrets` and set from Settings, because the provider picker that
  // uses it is itself a runtime setting. The Claude Code token was the last one
  // with an environment fallback; it no longer has one, so a token the operator
  // has not pasted does not exist and the Claude service fails with
  // ClaudeTokenMissingError at call time. See
  // docs/adr/0001-provider-credentials-in-postgres.md.
  // In-app Google OAuth (Web application client). Required in production; in dev
  // they default to empty and GoogleAuth surfaces OAuthConfigError at use-time.
  GOOGLE_CLIENT_ID: isProd ? z.string().min(1) : z.string().default(""),
  GOOGLE_CLIENT_SECRET: isProd ? z.string().min(1) : z.string().default(""),
  // The dev default is the URI the setup walkthrough tells the reader to
  // register (#138), imported rather than spelled again: the two disagreeing is
  // `redirect_uri_mismatch`, which surfaces at Google and never reaches us.
  GOOGLE_REDIRECT_URI: isProd ? z.string().url() : z.string().default(DEV_GOOGLE_REDIRECT_URI),
  // AES-256-GCM key (base64, 32 bytes) for refresh-token-at-rest. Required in
  // prod; in dev util/crypto falls back to plaintext with a one-time warning.
  TOKEN_ENCRYPTION_KEY: isProd ? z.string().min(1) : z.string().optional(),
  API_SECRET: z.string().min(1).default("change-me-to-a-random-string"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  // No WORP_* here on purpose (#107): the worp relay's base URL is a runtime
  // setting and its API key and proxy headers are runtime credentials, all set
  // from Settings → Integrations, for the same reason the provider key above
  // is. Nothing is imported from the environment, so an instance that used to
  // set these has worp off until the config is entered once in the app.
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  cached = EnvSchema.parse(process.env);
  debug("loaded", {
    CLAUDE_BIN: cached.CLAUDE_BIN,
    GOOGLE_CLIENT_ID: cached.GOOGLE_CLIENT_ID ? "set" : "unset",
    GOOGLE_REDIRECT_URI: cached.GOOGLE_REDIRECT_URI,
    API_PORT: cached.API_PORT,
    WEB_PORT: cached.WEB_PORT,
    WEB_ORIGIN: cached.WEB_ORIGIN,
  });
  return cached;
}
