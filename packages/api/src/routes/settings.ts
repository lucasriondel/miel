import { Hono } from "hono";
import {
  apiSchemas,
  clearGoogleOAuthConfig,
  getGoogleOAuthStatus,
  saveGoogleOAuthConfig,
  checkedDeleteProviderCredential,
  checkedUpdateModelSettings,
  deleteClaudeCodeToken,
  getClaudeCodeTokenStatus,
  getModelSettings,
  getProviderCredentialStatus,
  getScheduleSettings,
  getScheduleStatus,
  getTriageBatchSettings,
  getWorpSettings,
  setClaudeCodeToken,
  setProviderCredential,
  updateScheduleSettings,
  updateTriageBatchSettings,
  updateWorpSettings,
} from "@miel/core";

export const settingsRoutes = new Hono();

// The vendor comes from the path; parsing it through the enum means an unknown
// vendor is a 400 here rather than a lookup that finds nothing.
const providerOf = (raw: string) =>
  apiSchemas.ProviderCredentialParam.parse({ provider: raw }).provider;

settingsRoutes.get("/", async (c) => {
  const settings = await getModelSettings();
  return c.json(settings);
});

// Which combinations may be saved is not this route's rule to state (#124). It
// lives in core's `taskProviders` module — one checker, run before anything is
// written, so a two-task patch with one bad half is refused whole; and reachable
// by the CLI and the scheduler, which do not come through here. What used to be
// two inline guards is now two checked facades plus the error handler's mapping
// of `ProviderNotRunnableError` to the 400 body those guards answered with.
settingsRoutes.put("/", async (c) => {
  const body = apiSchemas.UpdateSettingsRequest.parse(await c.req.json());
  const settings = await checkedUpdateModelSettings(body);
  return c.json(settings);
});

settingsRoutes.get("/schedule", async (c) => {
  const settings = await getScheduleSettings();
  return c.json(settings);
});

settingsRoutes.get("/schedule/status", async (c) => {
  const status = await getScheduleStatus();
  return c.json(status);
});

settingsRoutes.put("/schedule", async (c) => {
  const body = apiSchemas.UpdateScheduleSettingsRequest.parse(await c.req.json());
  const settings = await updateScheduleSettings(body);
  return c.json(settings);
});

// ── Provider credentials ────────────────────────────────────────────────────
// Every success here is a ProviderCredentialStatus: a boolean and a masked
// hint. The key goes one way only — in through PUT, never back out, and never
// into a log line or an error body. The one non-status answer is DELETE's
// refusal, which names a task and a vendor and no part of the key (#117).

settingsRoutes.get("/provider-credentials/:provider", async (c) => {
  const status = await getProviderCredentialStatus(providerOf(c.req.param("provider")));
  return c.json(status);
});

settingsRoutes.put("/provider-credentials/:provider", async (c) => {
  const provider = providerOf(c.req.param("provider"));
  const body = apiSchemas.SetProviderCredentialRequest.parse(await c.req.json());
  const status = await setProviderCredential(provider, body.apiKey);
  return c.json(status);
});

settingsRoutes.delete("/provider-credentials/:provider", async (c) => {
  const status = await checkedDeleteProviderCredential(providerOf(c.req.param("provider")));
  return c.json(status);
});

// ── worp integration (#107) ─────────────────────────────────────────────────
// The relay's config is a runtime setting like everything else here. The base
// URL is not a secret and comes back in the clear; the API key comes back as
// presence plus a masked hint, and the proxy headers as names with masked
// values. Neither a secret nor its ciphertext is ever in a response.
//
// Validation (URL scheme, header-name tokens, reserved names) lives in the
// service so the CLI gets it too; a rejection surfaces as
// InvalidWorpSettingsError → 400 through the error middleware.

settingsRoutes.get("/worp", async (c) => {
  const settings = await getWorpSettings();
  return c.json(settings);
});

settingsRoutes.put("/worp", async (c) => {
  const body = apiSchemas.UpdateWorpSettingsRequest.parse(await c.req.json());
  const settings = await updateWorpSettings(body);
  return c.json(settings);
});

// ── Claude Code token ───────────────────────────────────────────────────────
// Same one-way contract as the vendor keys above, plus `source`: with a stored
// token and an env var both possible, "configured" alone does not tell the user
// which one their triage is running on (#109).

settingsRoutes.get("/claude-code-token", async (c) => {
  return c.json(await getClaudeCodeTokenStatus());
});

settingsRoutes.put("/claude-code-token", async (c) => {
  const body = apiSchemas.SetClaudeCodeTokenRequest.parse(await c.req.json());
  return c.json(await setClaudeCodeToken(body.token));
});

settingsRoutes.delete("/claude-code-token", async (c) => {
  return c.json(await deleteClaudeCodeToken());
});

settingsRoutes.get("/triage-batch", async (c) => {
  const settings = await getTriageBatchSettings();
  return c.json(settings);
});

settingsRoutes.put("/triage-batch", async (c) => {
  const body = apiSchemas.UpdateTriageBatchSettingsRequest.parse(await c.req.json());
  const settings = await updateTriageBatchSettings(body);
  return c.json(settings);
});

// The Google OAuth client entered in the app (onboarding's Google step). The
// database's client wins over the GOOGLE_* variables, which stay the fallback.
// Answers never carry the secret — a masked hint at most. A save or a clear that
// changes the client in effect answers `clientChanged` and how many connected
// accounts must reconnect (`reconnectRequired`), since a Google grant belongs to
// the client that issued it.
settingsRoutes.get("/google-oauth", async (c) => c.json(await getGoogleOAuthStatus()));

settingsRoutes.put("/google-oauth", async (c) => {
  const body = apiSchemas.UpdateGoogleOAuthRequest.parse(await c.req.json());
  return c.json(await saveGoogleOAuthConfig(body));
});

settingsRoutes.delete("/google-oauth", async (c) => c.json(await clearGoogleOAuthConfig()));
