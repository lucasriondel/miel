/**
 * Secrets stored in Postgres encrypted at rest instead of in the environment:
 * LLM provider API keys (#104), outbound-integration credentials (#107) and the
 * Claude Code CLI's token (#109).
 *
 * All three exist for the same reason. The thing the secret authorises — the
 * provider/model picker, the worp relay, the local CLI — is a runtime setting,
 * so the credential has to be settable at runtime too; an env var means the
 * choice cannot take effect without an operator editing `.env` and restarting.
 *
 * This module is the *only* place a decrypted secret exists. The boundary rule:
 *
 *   - outward (API routes, CLI, UI) → a {@link SecretStatus}-shaped value: a
 *     boolean and a masked hint (`sk-ant-…3f9`), never the secret or its
 *     ciphertext;
 *   - inward (the hosted-api provider, the worp relay — in-process) →
 *     {@link readSecretEffect} and the named readers built on it, all of which
 *     are deliberately NOT re-exported from `packages/core/src/index.ts`.
 *
 * Nothing here logs a secret or puts one in an error: `createDebug` sees the
 * secret's name and booleans only, and a rejected value is described by a
 * reason code rather than quoted back.
 *
 * The masking itself is `../credentialMasking` — a pure leaf module that
 * decrypts nothing and stores nothing, kept apart from this one so the privacy
 * policy can import the numbers it publishes (#113).
 */
import { Effect } from "effect";
import {
  CREDENTIAL_PROVIDERS,
  isCredentialProvider,
  type CredentialProvider,
} from "../credentialProviders";
import { MIN_KEY_LENGTH, maskCredential } from "../credentialMasking";
import { InvalidProviderCredentialError, InvalidSecretError } from "../errors";
import { SecretStore } from "../stores/contracts";
import { SecretStoreLive } from "../stores/postgres";
import {
  WORP_API_KEY_SECRET,
  WORP_EXTRA_HEADERS_SECRET,
  mergeExtraHeaders,
  validateExtraHeaders,
  type MaskedHeader,
  type WorpExtraHeaders,
  type WorpExtraHeadersPatch,
} from "../worpConfig";
import { createDebug } from "../util/debug";
import { decrypt, encrypt } from "../util/crypto";
import { runPromiseRethrow } from "../util/effect";

const debug = createDebug("service:encryptedSecrets");

/**
 * What the outside world is allowed to know about any stored secret, whatever
 * it names. The provider-facing {@link ProviderCredentialStatus} is this plus
 * the vendor it belongs to.
 */
export interface SecretStatus {
  configured: boolean;
  hint: string | null;
}

/** What the outside world is allowed to know about a stored credential. */
export interface ProviderCredentialStatus {
  provider: CredentialProvider;
  configured: boolean;
  /**
   * Enough of the key to recognise which one is stored, and no more — or null
   * when nothing is stored (and when a stored blob cannot be decrypted, since
   * presence is still knowable then but the hint is not).
   */
  hint: string | null;
}

// Re-exported so a caller that already imports this service does not need a
// second import for the vendor list it validates against, or for the masking —
// which lives in the leaf `credentialMasking.ts` because the privacy page has to
// import it without dragging in the db (#113).
export { CREDENTIAL_PROVIDERS, isCredentialProvider, type CredentialProvider };
export { maskCredential };

const absent = (provider: CredentialProvider): ProviderCredentialStatus => ({
  provider,
  configured: false,
  hint: null,
});

const assertProvider = (
  provider: CredentialProvider,
): Effect.Effect<CredentialProvider, InvalidProviderCredentialError> =>
  isCredentialProvider(provider)
    ? Effect.succeed(provider)
    : Effect.fail(new InvalidProviderCredentialError({ provider, reason: "unknown_provider" }));

// ── Name-keyed storage primitives ───────────────────────────────────────────
// The whole table in three operations. Everything below — the provider API and
// the worp readers — is these three plus validation, so there is one place that
// touches ciphertext.
//
// The queries live behind {@link SecretStore} (#132). The seam is drawn at the
// ciphertext, not at the row: `encrypt`/`decrypt` stay on this side of it, so
// the store — and anything substituted for it — sees a blob and never a secret.

/** The stored ciphertext, or null when the name has no row. */
export const readSecretBlobEffect = (
  name: string,
): Effect.Effect<string | null, never, SecretStore> => SecretStore.read(name);

const writeSecretEffect = (
  name: string,
  plaintext: string,
): Effect.Effect<void, never, SecretStore> =>
  Effect.gen(function* () {
    yield* SecretStore.write(name, encrypt(plaintext));
    debug("set", { name });
  });

const removeSecretEffect = (name: string): Effect.Effect<number, never, SecretStore> =>
  Effect.gen(function* () {
    const removed = yield* SecretStore.remove(name);
    debug("delete", { name, removed });
    return removed;
  });

/**
 * Decrypt without letting a rotated/garbled blob take down the caller: a
 * secret that cannot be read is reported as "present, hint unknown" rather
 * than as an exception carrying ciphertext.
 */
function tryDecrypt(blob: string): string | null {
  try {
    return decrypt(blob);
  } catch {
    debug.warn("stored secret could not be decrypted");
    return null;
  }
}

/**
 * INTERNAL. The decrypted value for a name, or null when none is stored.
 *
 * Not exported from the package barrel; the in-process readers built on it
 * (`readProviderCredentialEffect`, the worp config reader) import this module
 * directly. Anything reachable from outside core gets a status object.
 */
export const readSecretEffect = (name: string): Effect.Effect<string | null, never, SecretStore> =>
  Effect.gen(function* () {
    const blob = yield* readSecretBlobEffect(name);
    if (blob === null) {
      debug("read", { name, configured: false });
      return null;
    }
    const plain = tryDecrypt(blob);
    debug("read", { name, configured: plain !== null });
    return plain;
  });

/** Presence plus a masked hint for any name — the outward-safe view. */
export const getSecretStatusEffect = (
  name: string,
): Effect.Effect<SecretStatus, never, SecretStore> =>
  Effect.gen(function* () {
    const blob = yield* readSecretBlobEffect(name);
    if (blob === null) return { configured: false, hint: null };
    const plain = tryDecrypt(blob);
    debug("status", { name, configured: true });
    return { configured: true, hint: plain === null ? null : maskCredential(plain) };
  });

/**
 * Why a value cannot be stored as a secret, or null when it can: blank, or too
 * short to be a credential rather than a paste accident.
 *
 * Pure and exported — the one definition of that bar, so nothing has to restate
 * it as a second comparison against {@link MIN_KEY_LENGTH}. Both setters below
 * are this plus an error type, and `worpSettings.ts` calls it directly because
 * it has to refuse a bad key *before* it writes the other fields of the same
 * patch (#118). Exporting it costs nothing outward: it holds no secret, decrypts
 * nothing, and answers about the caller's own input.
 */
export function secretValueProblem(value: string): "empty" | "too_short" | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "empty";
  if (trimmed.length < MIN_KEY_LENGTH) return "too_short";
  return null;
}

/**
 * Store any named secret, validated the way a vendor key is: trimmed, non-empty
 * and long enough that it is a credential rather than a paste accident. The
 * rejection carries a reason code and the name, never the value (#109).
 */
export const setSecretEffect = (
  name: string,
  value: string,
): Effect.Effect<SecretStatus, InvalidSecretError, SecretStore> =>
  Effect.gen(function* () {
    const problem = secretValueProblem(value);
    if (problem !== null) {
      return yield* new InvalidSecretError({ name, reason: problem });
    }
    const trimmed = value.trim();

    yield* writeSecretEffect(name, trimmed);
    return { configured: true, hint: maskCredential(trimmed) };
  });

/** Drop a named secret's row. Idempotent — nothing stored is not an error. */
export const deleteSecretEffect = (name: string): Effect.Effect<SecretStatus, never, SecretStore> =>
  Effect.map(removeSecretEffect(name), () => ({ configured: false, hint: null }));

export const getProviderCredentialStatusEffect = (
  provider: CredentialProvider,
): Effect.Effect<ProviderCredentialStatus, InvalidProviderCredentialError, SecretStore> =>
  Effect.gen(function* () {
    yield* assertProvider(provider);
    const status = yield* getSecretStatusEffect(provider);
    return status.configured ? { provider, ...status } : absent(provider);
  });

export const setProviderCredentialEffect = (
  provider: CredentialProvider,
  apiKey: string,
): Effect.Effect<ProviderCredentialStatus, InvalidProviderCredentialError, SecretStore> =>
  Effect.gen(function* () {
    yield* assertProvider(provider);
    const problem = secretValueProblem(apiKey);
    if (problem !== null) {
      return yield* new InvalidProviderCredentialError({ provider, reason: problem });
    }
    const trimmed = apiKey.trim();

    yield* writeSecretEffect(provider, trimmed);
    return { provider, configured: true, hint: maskCredential(trimmed) };
  });

export const deleteProviderCredentialEffect = (
  provider: CredentialProvider,
): Effect.Effect<ProviderCredentialStatus, InvalidProviderCredentialError, SecretStore> =>
  Effect.gen(function* () {
    yield* assertProvider(provider);
    yield* removeSecretEffect(provider);
    return absent(provider);
  });

/**
 * INTERNAL. The decrypted key, or null when none is stored.
 *
 * Not exported from the package barrel — the hosted-api provider imports this
 * module directly. Anything reachable from outside core gets a status object.
 */
export const readProviderCredentialEffect = (
  provider: CredentialProvider,
): Effect.Effect<string | null, InvalidProviderCredentialError, SecretStore> =>
  Effect.gen(function* () {
    yield* assertProvider(provider);
    return yield* readSecretEffect(provider);
  });

// ── worp's two secrets (#107) ───────────────────────────────────────────────
// The relay's API key and its proxy header map. Same table, same encryption,
// same boundary rule as a vendor key: the readers below are in-process only,
// and the API routes above them see status objects and masked values.

/** INTERNAL. worp's bearer token, or null when none is stored. */
export const readWorpApiKeyEffect = (): Effect.Effect<string | null, never, SecretStore> =>
  readSecretEffect(WORP_API_KEY_SECRET);

/**
 * Presence + masked hint for worp's key — the outward-safe view.
 *
 * A named wrapper rather than `getSecretStatusEffect(WORP_API_KEY_SECRET)` at
 * the call site, so worp's four accessors are one addressable set: a caller
 * (or a test) can substitute worp's storage without touching the shared
 * name-keyed primitives every other secret goes through too.
 */
export const getWorpApiKeyStatusEffect = (): Effect.Effect<SecretStatus, never, SecretStore> =>
  getSecretStatusEffect(WORP_API_KEY_SECRET);

/**
 * INTERNAL. The proxy header map, or null when none is stored.
 *
 * A blob that does not parse, or that no longer satisfies the shape rules, is
 * treated as absent rather than thrown: the relay's own auth is independent of
 * it, so a garbled map should degrade to "no proxy headers" — a 403 from the
 * proxy naming the problem — rather than take down a request that might not
 * have needed the headers at all.
 */
export const readWorpExtraHeadersEffect = (): Effect.Effect<
  WorpExtraHeaders | null,
  never,
  SecretStore
> =>
  Effect.gen(function* () {
    const raw = yield* readSecretEffect(WORP_EXTRA_HEADERS_SECRET);
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      debug.warn("stored worp header map is not valid JSON");
      return null;
    }
    if (validateExtraHeaders(parsed) !== null) {
      debug.warn("stored worp header map failed validation");
      return null;
    }
    const headers = parsed as WorpExtraHeaders;
    return Object.keys(headers).length > 0 ? headers : null;
  });

/**
 * Store worp's bearer token, held to the same bar as every other secret here
 * (#118).
 *
 * It used to trim and write whatever it was given, which is what made worp's key
 * the one credential a one-character paste could be stored as — and the relay's
 * up-front gate, whose whole purpose is to catch a misconfiguration before a
 * socket is opened, then reported itself configured and failed at worp instead.
 * `setSecretEffect` is the check: shared minimum, shared error.
 */
export const setWorpApiKeyEffect = (
  apiKey: string,
): Effect.Effect<SecretStatus, InvalidSecretError, SecretStore> =>
  setSecretEffect(WORP_API_KEY_SECRET, apiKey);

export const deleteWorpApiKeyEffect = (): Effect.Effect<SecretStatus, never, SecretStore> =>
  Effect.map(removeSecretEffect(WORP_API_KEY_SECRET), () => ({ configured: false, hint: null }));

/**
 * Store the header map, or drop the row when the map is empty — an empty map
 * and no map mean the same thing to the relay, so keeping a `{}` row around
 * would be a second way to spell "no proxy headers".
 */
export const setWorpExtraHeadersEffect = (
  headers: WorpExtraHeaders,
): Effect.Effect<void, never, SecretStore> =>
  Object.keys(headers).length === 0
    ? Effect.asVoid(removeSecretEffect(WORP_EXTRA_HEADERS_SECRET))
    : writeSecretEffect(WORP_EXTRA_HEADERS_SECRET, JSON.stringify(headers));

/**
 * Apply a patch to the stored map: set the headers it names, remove the ones
 * it names null, leave the rest as they are.
 *
 * The merge happens here rather than in `worpSettings.ts` because it needs the
 * stored *values* — the ones the patch keeps — and this module is the only one
 * allowed to decrypt. What crosses back out is a void: the caller re-reads the
 * masked view like any other reader.
 */
export const patchWorpExtraHeadersEffect = (
  patch: WorpExtraHeadersPatch,
): Effect.Effect<void, never, SecretStore> =>
  Effect.flatMap(readWorpExtraHeadersEffect(), (stored) =>
    setWorpExtraHeadersEffect(mergeExtraHeaders(stored, patch)),
  );

/**
 * The outward-safe view of the header map: every name, every value masked.
 * This is what the settings route returns — never a value, never ciphertext.
 */
export const getWorpExtraHeadersMaskedEffect = (): Effect.Effect<
  MaskedHeader[],
  never,
  SecretStore
> =>
  Effect.map(readWorpExtraHeadersEffect(), (headers) =>
    headers === null
      ? []
      : Object.entries(headers).map(([name, value]) => ({
          name,
          valueHint: maskCredential(value),
        })),
  );

// Promise facades for the API/CLI boundary. `readProviderCredential` has none
// on purpose: a Promise facade is a boundary API, and the decrypted key has no
// business at a boundary. worp's two readers have none for the same reason.
//
// This is also where production provides the Postgres adapter (#132): every
// effect above carries `SecretStore` in its `R` channel, so nothing can reach a
// database without a caller saying which one.
const run = <A, E>(eff: Effect.Effect<A, E, SecretStore>): Promise<A> =>
  runPromiseRethrow(Effect.provide(eff, SecretStoreLive));

export async function getProviderCredentialStatus(
  provider: CredentialProvider,
): Promise<ProviderCredentialStatus> {
  return run(getProviderCredentialStatusEffect(provider));
}

export async function setProviderCredential(
  provider: CredentialProvider,
  apiKey: string,
): Promise<ProviderCredentialStatus> {
  return run(setProviderCredentialEffect(provider, apiKey));
}

export async function deleteProviderCredential(
  provider: CredentialProvider,
): Promise<ProviderCredentialStatus> {
  return run(deleteProviderCredentialEffect(provider));
}
