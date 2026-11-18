/**
 * The Google OAuth client miel signs into Gmail with, entered in the app.
 *
 * The onboarding gate's Google step asks for the client ID, the client secret
 * and the redirect URI, so a fresh install no longer needs `.env` edited and the
 * API restarted before it can connect a mailbox. Stored the way every other
 * runtime credential is: the ID and the redirect URI in `app_settings`
 * (`google.client_id`, `google.redirect_uri`), the secret encrypted in
 * `encrypted_secrets` (`google.client_secret`) — `encryptedSecrets.ts` stays the
 * only module that decrypts it, and nothing outward sees more than a hint.
 *
 * **The database wins, the environment is the fallback.** An install that has a
 * client ID stored uses the stored client, all three fields of it; one that has
 * not uses `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI`
 * exactly as before, so an existing deployment keeps working with nothing
 * entered. The two are never mixed field by field: a stored ID with the
 * environment's secret would be a client Google has never issued.
 *
 * **Changing the client disconnects every mailbox.** A refresh token is bound to
 * the client that minted it, so once a different client ID is in effect every
 * stored grant fails to refresh (`TokenRefreshError`, a reconnect prompt). The
 * status says how many accounts that is (`accountsToReconnect`) before a save,
 * and the save says whether it happened, so the UI can warn first and explain
 * after. Nothing is deleted: putting the old client back revives the grants.
 */
import { Effect } from "effect";
import { GOOGLE_OAUTH_CALLBACK_PATH, DEV_GOOGLE_REDIRECT_URI } from "../googleOAuthSetup";
import { InvalidGoogleOAuthConfigError } from "../errors";
import { missingOAuthEnv, oauthEnv, type OAuthEnv } from "../google/oauthClient";
import { MessageStore, SecretStore, SettingsStore, type Stores } from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { createDebug } from "../util/debug";
import {
  deleteSecretEffect,
  getSecretStatusEffect,
  readSecretEffect,
  secretValueProblem,
  setSecretEffect,
} from "./encryptedSecrets";

const debug = createDebug("service:googleOAuthConfig");

export const GOOGLE_CLIENT_ID_SETTING = "google.client_id";
export const GOOGLE_REDIRECT_URI_SETTING = "google.redirect_uri";
export const GOOGLE_CLIENT_SECRET_SECRET = "google.client_secret";

/** Where the client in effect comes from; null when there is none at all. */
export type GoogleOAuthSource = "database" | "environment";

/** The client in effect, secret included — for `GoogleAuth` and nothing outward. */
export interface ResolvedGoogleOAuthConfig extends OAuthEnv {
  source: GoogleOAuthSource;
}

const readSetting = (key: string): Effect.Effect<string, never, SettingsStore> =>
  Effect.map(
    SettingsStore.use((svc) => svc.read(key)),
    (v) => (v ?? "").trim(),
  );

/**
 * INTERNAL. The client to build an `OAuth2Client` from. Not exported from the
 * package barrel: it carries the decrypted secret, and `GoogleAuth` imports this
 * module directly, the way `Claude.ts` imports the credential readers.
 */
export const resolveGoogleOAuthConfigEffect = (): Effect.Effect<
  ResolvedGoogleOAuthConfig,
  never,
  SettingsStore | SecretStore
> =>
  Effect.gen(function* () {
    const clientId = yield* readSetting(GOOGLE_CLIENT_ID_SETTING);
    if (clientId.length === 0) return { ...oauthEnv(), source: "environment" as const };
    const clientSecret = (yield* readSecretEffect(GOOGLE_CLIENT_SECRET_SECRET)) ?? "";
    const redirectUri = yield* readSetting(GOOGLE_REDIRECT_URI_SETTING);
    return { clientId, clientSecret, redirectUri, source: "database" as const };
  });

/** What the app is told about the client in effect: never the secret. */
export interface GoogleOAuthStatus {
  configured: boolean;
  /**
   * The missing pieces, named as the environment variables that would supply
   * them — the shape `GET /auth/google/config` always answered.
   */
  missing: string[];
  source: GoogleOAuthSource | null;
  /** The client ID in effect. Not a secret: it is in every consent URL. */
  clientId: string | null;
  redirectUri: string | null;
  /** A masked hint of the stored secret; null for an environment client. */
  secretHint: string | null;
  /** The redirect URI a local `bun dev` run registers, for the form's placeholder. */
  devRedirectUri: string;
  /** The path a redirect URI must end in. */
  callbackPath: string;
  /**
   * Connected accounts whose grants a *different* client would invalidate —
   * the number the UI warns with before a save. Zero when nothing is connected.
   */
  accountsToReconnect: number;
}

export const getGoogleOAuthStatusEffect = (): Effect.Effect<
  GoogleOAuthStatus,
  never,
  SettingsStore | SecretStore | MessageStore
> =>
  Effect.gen(function* () {
    const resolved = yield* resolveGoogleOAuthConfigEffect();
    const missing = missingOAuthEnv(resolved);
    const anything = resolved.clientId || resolved.clientSecret || resolved.redirectUri;
    const secret =
      resolved.source === "database"
        ? yield* getSecretStatusEffect(GOOGLE_CLIENT_SECRET_SECRET)
        : { hint: null };
    const accounts = yield* MessageStore.use((svc) => svc.accounts());
    return {
      configured: missing.length === 0,
      missing,
      source: anything ? resolved.source : null,
      clientId: resolved.clientId || null,
      redirectUri: resolved.redirectUri || null,
      secretHint: secret.hint,
      devRedirectUri: DEV_GOOGLE_REDIRECT_URI,
      callbackPath: GOOGLE_OAUTH_CALLBACK_PATH,
      accountsToReconnect: accounts.length,
    };
  });

/** Why a redirect URI cannot be registered as one, or null when it can. */
export function redirectUriProblem(uri: string): "invalid" | "wrong_callback_path" | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return "invalid";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "invalid";
  if (url.search || url.hash) return "invalid";
  return url.pathname.endsWith(GOOGLE_OAUTH_CALLBACK_PATH) ? null : "wrong_callback_path";
}

export interface SaveGoogleOAuthConfigArgs {
  clientId: string;
  /** Omitted keeps the stored secret — changing only the redirect URI needs no re-paste. */
  clientSecret?: string;
  redirectUri: string;
}

export interface SaveGoogleOAuthConfigResult extends GoogleOAuthStatus {
  /** Whether a different client ID than the one in effect before is now in effect. */
  clientChanged: boolean;
  /**
   * How many connected accounts must reconnect because of this save: every one
   * of them when the client changed, none otherwise.
   */
  reconnectRequired: number;
}

const invalid = (
  field: InvalidGoogleOAuthConfigError["field"],
  reason: InvalidGoogleOAuthConfigError["reason"],
  message: string,
) => new InvalidGoogleOAuthConfigError({ field, reason, message });

/**
 * Store a client. All three fields are checked before anything is written, so a
 * refused save leaves the client in effect untouched.
 */
export const saveGoogleOAuthConfigEffect = (
  args: SaveGoogleOAuthConfigArgs,
): Effect.Effect<SaveGoogleOAuthConfigResult, InvalidGoogleOAuthConfigError, Stores> =>
  Effect.gen(function* () {
    const clientId = args.clientId.trim();
    const redirectUri = args.redirectUri.trim();
    if (clientId.length === 0 || /\s/.test(clientId)) {
      return yield* invalid(
        "clientId",
        clientId.length === 0 ? "missing" : "invalid",
        "Paste the client ID from the Google Cloud console.",
      );
    }
    const uriProblem = redirectUriProblem(redirectUri);
    if (uriProblem !== null) {
      return yield* invalid(
        "redirectUri",
        uriProblem,
        uriProblem === "wrong_callback_path"
          ? `The redirect URI must end in ${GOOGLE_OAUTH_CALLBACK_PATH}.`
          : "The redirect URI must be an http(s) URL with no query or fragment.",
      );
    }
    const before = yield* resolveGoogleOAuthConfigEffect();
    const secret = args.clientSecret?.trim();
    if (secret !== undefined && secret.length > 0) {
      if (secretValueProblem(secret) !== null) {
        return yield* invalid(
          "clientSecret",
          "invalid",
          "That does not look like a client secret.",
        );
      }
    } else if (before.source !== "database" || before.clientSecret.length === 0) {
      return yield* invalid("clientSecret", "missing", "Paste the client secret too.");
    }

    if (secret !== undefined && secret.length > 0) {
      yield* setSecretEffect(GOOGLE_CLIENT_SECRET_SECRET, secret).pipe(
        Effect.catch(() =>
          Effect.fail(
            invalid("clientSecret", "invalid", "That does not look like a client secret."),
          ),
        ),
      );
    }
    yield* SettingsStore.use((svc) => svc.write(GOOGLE_REDIRECT_URI_SETTING, redirectUri));
    // The client ID last: it is what switches the source to the database, so a
    // failure above leaves the environment client in effect, not half of each.
    yield* SettingsStore.use((svc) => svc.write(GOOGLE_CLIENT_ID_SETTING, clientId));

    const status = yield* getGoogleOAuthStatusEffect();
    const clientChanged = before.clientId.length > 0 && before.clientId !== clientId;
    debug("saved", { clientChanged, accounts: status.accountsToReconnect });
    return {
      ...status,
      clientChanged,
      reconnectRequired: clientChanged ? status.accountsToReconnect : 0,
    };
  });

/**
 * Forget the stored client, so the environment's (if any) is in effect again.
 * The same warning applies: if that is a different client, every account must
 * reconnect.
 */
export const clearGoogleOAuthConfigEffect = (): Effect.Effect<
  SaveGoogleOAuthConfigResult,
  never,
  Stores
> =>
  Effect.gen(function* () {
    const before = yield* resolveGoogleOAuthConfigEffect();
    yield* SettingsStore.use((svc) => svc.write(GOOGLE_CLIENT_ID_SETTING, ""));
    yield* SettingsStore.use((svc) => svc.write(GOOGLE_REDIRECT_URI_SETTING, ""));
    yield* deleteSecretEffect(GOOGLE_CLIENT_SECRET_SECRET);
    const status = yield* getGoogleOAuthStatusEffect();
    const after = status.clientId ?? "";
    const clientChanged = before.clientId.length > 0 && before.clientId !== after;
    return {
      ...status,
      clientChanged,
      reconnectRequired: clientChanged ? status.accountsToReconnect : 0,
    };
  });

// Promise facades for the API/CLI boundary.
export async function getGoogleOAuthStatus(): Promise<GoogleOAuthStatus> {
  return runWithStores(getGoogleOAuthStatusEffect());
}

export async function saveGoogleOAuthConfig(
  args: SaveGoogleOAuthConfigArgs,
): Promise<SaveGoogleOAuthConfigResult> {
  return runWithStores(saveGoogleOAuthConfigEffect(args));
}

export async function clearGoogleOAuthConfig(): Promise<SaveGoogleOAuthConfigResult> {
  return runWithStores(clearGoogleOAuthConfigEffect());
}
