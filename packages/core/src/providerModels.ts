/**
 * Which provider can run an AI task, and which models each one offers (#105) —
 * plus, since #123, what the tasks themselves are called.
 *
 * A leaf module with one import (`credentialProviders`, itself a leaf), like
 * `claudeUsage.ts` and `appBasePath.ts`: the Zod request schemas, the settings
 * service, the API route and the web UI all need this catalogue, and none of
 * them should pull in the db client to get it.
 *
 * A **provider** is a vendor, named directly — not a prefix parsed out of a
 * model id at call time, which is what the single-vendor hosted path used to
 * do. That matters because the credential lookup is keyed by vendor: the code
 * that fetches a key has to be able to say which vendor's key it wants.
 *
 * `claude-code` is the local `claude` subprocess and needs no stored key; the
 * other three are HTTP APIs and each needs its own. The two lists are wired
 * together rather than restated — a provider you can pick is a provider you can
 * store a credential for.
 */
import { CREDENTIAL_PROVIDERS, type CredentialProvider } from "./credentialProviders";

// Re-exported so a caller that needs "the vendors" and "the providers" together
// — the settings UI does — has one module to import from.
export { CREDENTIAL_PROVIDERS, type CredentialProvider };

/**
 * The local Claude Code CLI — a subprocess, authenticated by a token stored in
 * the app with `CLAUDE_CODE_OAUTH_TOKEN` as the fallback (#109).
 */
export const CLAUDE_CODE_PROVIDER = "claude-code";

export const PROVIDERS = [CLAUDE_CODE_PROVIDER, ...CREDENTIAL_PROVIDERS] as const;
export type Provider = (typeof PROVIDERS)[number];

/**
 * What a fresh install triages, replies and suggests filters with before anyone
 * opens Settings — `SETTING_DEFAULTS` is built from this, and so is the
 * fallback for a stored provider that cannot be read.
 *
 * Exported as a constant (#112) because it is a documented fact, not just an
 * implementation detail: the README and the landing-page guide have to tell a
 * reader which provider is already running and which credential it therefore
 * needs, and they are tested against this rather than against a copy of it.
 */
export const DEFAULT_PROVIDER: Provider = CLAUDE_CODE_PROVIDER;

/**
 * How each provider is named in the UI — the picker options, the Credentials
 * card and the "no key stored" failure all read this map rather than spelling a
 * vendor out.
 *
 * The local one is "Claude Code", not "CLI" (#108): next to three vendor names
 * a category noun reads as the odd one out, and Claude Code is what the README,
 * the landing page and the token that authenticates it all call it. Only the
 * label says so — the id stays `claude-code`, which is what is stored.
 */
export const PROVIDER_LABELS: Record<Provider, string> = {
  "claude-code": "Claude Code",
  anthropic: "Anthropic",
  google: "Google",
  openai: "OpenAI",
};

/**
 * The three AI tasks that each carry their own provider + model. Iterated
 * rather than spelled out three times: the settings service builds its keys and
 * its `ModelSettings` fields from it and the settings route validates the same
 * three pairs, so one list keeps them from drifting.
 *
 * Here rather than in the settings service (#123), where it used to live: that
 * service imports the db client, so naming a task meant reaching a service to
 * do it, which `errors.ts` cannot without an import cycle. It belongs beside
 * the provider vocabulary anyway — every use of a task names a provider in the
 * same breath. `services/settings.ts` re-exports both names, so no caller had
 * to move with it.
 */
export const MODEL_TASKS = ["triage", "reply", "filter"] as const;
export type ModelTask = (typeof MODEL_TASKS)[number];

export interface ProviderModel {
  /** The bare model id sent to the vendor — never prefixed. */
  id: string;
  /** What the picker shows: name plus the trade-off in a few words. */
  label: string;
}

/**
 * A curated list per provider, deliberately short. The first entry is that
 * provider's default (see {@link defaultModelFor}) and is the cheap/fast one:
 * switching vendor should not silently move a user onto the priciest model.
 *
 * Curated rather than free text because the settings route validates the pair —
 * an id that the selected vendor does not serve is rejected at save time rather
 * than failing on the next sync.
 */
export const PROVIDER_MODELS: Record<Provider, readonly ProviderModel[]> = {
  "claude-code": [
    { id: "claude-haiku-4-5", label: "Haiku 4.5 · fast, cheap" },
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6 · balanced" },
    { id: "claude-opus-4-7", label: "Opus 4.7 · highest quality" },
  ],
  anthropic: [
    { id: "claude-haiku-4-5", label: "Haiku 4.5 · fast, cheap" },
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6 · balanced" },
    { id: "claude-opus-4-7", label: "Opus 4.7 · highest quality" },
  ],
  google: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash · fast, cheap" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro · highest quality" },
  ],
  openai: [
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini · fast, cheap" },
    { id: "gpt-4.1", label: "GPT-4.1 · balanced" },
    { id: "o4-mini", label: "o4-mini · reasoning" },
  ],
};

export function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

/**
 * True for the three HTTP vendors, false for the local subprocess. Narrowing to
 * `CredentialProvider` is the point: past this check the caller may ask the
 * credential service for that vendor's key.
 */
export function isHostedProvider(provider: Provider): provider is CredentialProvider {
  return provider !== CLAUDE_CODE_PROVIDER;
}

export function defaultModelFor(provider: Provider): string {
  return PROVIDER_MODELS[provider][0].id;
}

export function isModelForProvider(provider: Provider, modelId: string): boolean {
  return PROVIDER_MODELS[provider].some((m) => m.id === modelId.trim());
}

/**
 * Read a provider out of storage written before this issue.
 *
 * `hosted-api` meant Anthropic and could not have meant anything else — the old
 * hosted path threw on every model prefix but `anthropic`. Anything else
 * unreadable falls back to {@link DEFAULT_PROVIDER}, the local CLI — the one
 * provider that cannot leak mail to a vendor the user did not choose.
 */
export function normalizeProvider(raw: string): Provider {
  const value = raw.trim();
  if (value === "hosted-api") return "anthropic";
  return isProvider(value) ? value : DEFAULT_PROVIDER;
}

/** Drop a `vendor/` prefix from a stored model id; bare ids pass through. */
export function normalizeModelId(raw: string): string {
  return raw.trim().replace(/^[^/]+\//, "");
}
