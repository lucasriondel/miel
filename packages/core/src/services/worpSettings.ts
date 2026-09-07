/**
 * The outward view of worp's configuration, and the only way to change it
 * (#107).
 *
 * worp's config is split across two homes because its three parts are not the
 * same kind of thing: the base URL is not a secret and lives in `app_settings`
 * beside the other runtime settings, while the API key and the proxy header
 * map are encrypted in `encrypted_secrets`. This module is the seam that hides
 * the split — one read, one patch — so the API route and the UI deal with
 * "worp settings" rather than with two storage mechanisms.
 *
 * Nothing here returns a secret. {@link WorpSettings} carries the base URL in
 * the clear, presence plus a masked hint for the key, and the header *names*
 * with masked values. The plaintext readers stay in `encryptedSecrets.ts` and
 * are reachable only from `sendToWorp.ts`.
 */
import { Effect } from "effect";
import {
  deleteWorpApiKeyEffect,
  getWorpApiKeyStatusEffect,
  getWorpExtraHeadersMaskedEffect,
  patchWorpExtraHeadersEffect,
  secretValueProblem,
  setWorpApiKeyEffect,
  type SecretStatus,
} from "./encryptedSecrets";
import { getSettingEffect, setSettingEffect } from "./settings";
import { createDebug } from "../util/debug";
import { Stores } from "../stores/contracts";
import { StoresLive } from "../stores/postgres";
import { runPromiseRethrow } from "../util/effect";
import { InvalidWorpSettingsError } from "../errors";
import {
  WORP_BASE_URL_SETTING,
  validateExtraHeaderPatch,
  type MaskedHeader,
  type WorpExtraHeadersPatch,
} from "../worpConfig";

const debug = createDebug("service:worpSettings");

export interface WorpSettings {
  /** Empty when worp is not configured. Not a secret — shown in full. */
  baseUrl: string;
  /** Presence + masked hint for the API key. Never the key itself. */
  apiKey: SecretStatus;
  /** Every proxy header's name, with its value masked. */
  extraHeaders: MaskedHeader[];
  /**
   * The gate `sendToWorp` applies, precomputed so the UI does not restate the
   * rule and drift from it: worp is off until base URL and key are both set.
   */
  configured: boolean;
}

export interface WorpSettingsPatch {
  baseUrl?: string;
  /** Omitted leaves the stored key alone; null clears it. */
  apiKey?: string | null;
  /**
   * A patch over the stored map, not a replacement (#119): a string sets that
   * header, `null` removes it, an unnamed header is left alone. The map is
   * cleared by naming every stored header null.
   *
   * The caller that matters here is the settings UI, which is shown names and
   * masked hints and never the values. A replacement would make removing one
   * header mean retyping every other one's secret, and would silently delete
   * whatever was added between the page load and the save.
   */
  extraHeaders?: WorpExtraHeadersPatch;
}

/**
 * Reject a base URL that `fetch` would only fail on much later, during a
 * relay. Empty is allowed and means "worp off" — that is how it is cleared.
 */
function checkBaseUrl(raw: string): InvalidWorpSettingsError | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return new InvalidWorpSettingsError({ field: "baseUrl", reason: "not_a_url" });
  }
  // A relay posts a body to this host; anything but HTTP(S) cannot carry one,
  // and `file:`/`data:` URLs here would be a way to point the relay inward.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return new InvalidWorpSettingsError({ field: "baseUrl", reason: "not_http" });
  }
  return null;
}

/**
 * Reject a key too short to be one — the same bar `setWorpApiKeyEffect` applies,
 * applied here as well so a patch carrying a bad key is refused whole rather
 * than after the base URL beside it has been written (#118).
 *
 * A blank key is not a rejection: it means "clear it", the same as an explicit
 * null, and is handled by the write path below.
 */
function checkApiKey(raw: string): InvalidWorpSettingsError | null {
  return secretValueProblem(raw) === "too_short"
    ? new InvalidWorpSettingsError({ field: "apiKey", reason: "too_short" })
    : null;
}

/**
 * The header map's failure modes, translated from the leaf validator into the
 * error the route turns into a 400. The offending header's *name* travels with
 * it — a name is not a secret, and naming it is what makes the message useful.
 */
function checkExtraHeaders(headers: WorpExtraHeadersPatch): InvalidWorpSettingsError | null {
  const problem = validateExtraHeaderPatch(headers);
  if (problem === null) return null;
  const field = "extraHeaders";
  switch (problem.kind) {
    case "not_an_object":
      return new InvalidWorpSettingsError({ field, reason: "not_an_object" });
    case "value_not_a_string":
      return new InvalidWorpSettingsError({
        field,
        reason: "value_not_a_string",
        header: problem.name,
      });
    case "invalid_name":
      return new InvalidWorpSettingsError({
        field,
        reason: "invalid_header_name",
        header: problem.name,
      });
    case "reserved_name":
      return new InvalidWorpSettingsError({
        field,
        reason: "reserved_header_name",
        header: problem.name,
      });
  }
}

export const getWorpSettingsEffect = (): Effect.Effect<WorpSettings, never, Stores> =>
  Effect.gen(function* () {
    const [rawBaseUrl, apiKey, extraHeaders] = yield* Effect.all(
      [
        getSettingEffect(WORP_BASE_URL_SETTING).pipe(Effect.orElseSucceed(() => "")),
        getWorpApiKeyStatusEffect(),
        getWorpExtraHeadersMaskedEffect(),
      ],
      { concurrency: "unbounded" },
    );
    const baseUrl = rawBaseUrl.trim();
    return {
      baseUrl,
      apiKey,
      extraHeaders,
      configured: baseUrl.length > 0 && apiKey.configured,
    };
  });

/**
 * Apply a patch, validating every field before writing any of them — a patch
 * with one bad half is refused whole rather than half-applied, matching how
 * the model settings route treats a two-task patch.
 */
export const updateWorpSettingsEffect = (
  patch: WorpSettingsPatch,
): Effect.Effect<WorpSettings, InvalidWorpSettingsError, Stores> =>
  Effect.gen(function* () {
    if (patch.baseUrl !== undefined) {
      const bad = checkBaseUrl(patch.baseUrl);
      if (bad) return yield* Effect.fail(bad);
    }
    if (typeof patch.apiKey === "string") {
      const bad = checkApiKey(patch.apiKey);
      if (bad) return yield* Effect.fail(bad);
    }
    if (patch.extraHeaders !== undefined) {
      const bad = checkExtraHeaders(patch.extraHeaders);
      if (bad) return yield* Effect.fail(bad);
    }
    // An empty key is how the UI says "clear it", the same as an explicit null;
    // storing it would leave a credential that authenticates nothing.
    const clearingKey = patch.apiKey === null || patch.apiKey?.trim() === "";

    const ops: Effect.Effect<unknown, never, Stores>[] = [];
    if (patch.baseUrl !== undefined) {
      ops.push(setSettingEffect(WORP_BASE_URL_SETTING, patch.baseUrl.trim()));
    }
    if (clearingKey) {
      ops.push(deleteWorpApiKeyEffect());
    } else if (patch.apiKey !== undefined && patch.apiKey !== null) {
      // `orDie`: the setter's own validation is `checkApiKey` above, run on the
      // same string before any of these ops start, so a failure here would be a
      // divergence between the two — a bug, not a rejected input, and reporting
      // it as a 400 would say the caller's key was bad when it was not.
      ops.push(Effect.orDie(setWorpApiKeyEffect(patch.apiKey)));
    }
    if (patch.extraHeaders !== undefined) {
      ops.push(patchWorpExtraHeadersEffect(patch.extraHeaders));
    }
    yield* Effect.all(ops, { concurrency: "unbounded" });

    // Booleans and counts only: no URL, no key, no header name, no value.
    const headerEntries = Object.values(patch.extraHeaders ?? {});
    debug("updated", {
      baseUrl: patch.baseUrl !== undefined,
      apiKey: patch.apiKey !== undefined,
      clearingKey,
      headersSet: headerEntries.filter((v) => v !== null).length,
      headersRemoved: headerEntries.filter((v) => v === null).length,
    });
    return yield* getWorpSettingsEffect();
  });

// Promise facades for the API/CLI boundary — and where the Postgres adapters
// behind both halves of the split are provided (#132).
const run = <A, E>(eff: Effect.Effect<A, E, Stores>): Promise<A> =>
  runPromiseRethrow(Effect.provide(eff, StoresLive));

export async function getWorpSettings(): Promise<WorpSettings> {
  return run(getWorpSettingsEffect());
}

export async function updateWorpSettings(patch: WorpSettingsPatch): Promise<WorpSettings> {
  return run(updateWorpSettingsEffect(patch));
}
