/**
 * Boundary runners for the Google/Claude Effect services.
 *
 * The API and CLI consume Promises, so these helpers provide the right Layer
 * and run an Effect to a Promise, rethrowing the original tagged failure (not a
 * FiberFailure wrapper) so `instanceof` / `_tag` checks keep working at the
 * boundary. Use `runWithGoogleAuth` for OAuth-only effects (consentUrl /
 * exchangeCode / profileFromToken) and `runWithApp` for anything that touches
 * the Gmail services or Claude.
 */
import { Effect } from "effect";
import { runPromiseRethrow } from "../util/effect";
import { GoogleAuthLive } from "./GoogleAuth";
import { AppLive } from "./layers";
import {
  GoogleAuth,
  GmailFilters,
  GmailLabels,
  GmailMessages,
  GmailModify,
  GmailProfile,
  GmailThreads,
  type AccountProfile,
  type TokenGrant,
} from "./contracts";
import { Claude } from "../claude/Claude";
import type { Stores } from "../stores/contracts";

/** All services AppLive provides — the `R` an app-level effect may require. */
type AppServices =
  | Stores
  | GoogleAuth
  | GmailMessages
  | GmailLabels
  | GmailFilters
  | GmailThreads
  | GmailModify
  | GmailProfile
  | Claude;

/** Run an effect needing only `GoogleAuth`. */
export function runWithGoogleAuth<A, E>(eff: Effect.Effect<A, E, GoogleAuth>): Promise<A> {
  return runPromiseRethrow(Effect.provide(eff, GoogleAuthLive));
}

/** Run an effect needing any of the Google services and/or Claude. */
export function runWithApp<A, E>(eff: Effect.Effect<A, E, AppServices>): Promise<A> {
  return runPromiseRethrow(Effect.provide(eff, AppLive));
}

/**
 * Exchange an OAuth `?code=` for tokens and read the account profile in one
 * pass, so the API boundary never has to import `effect` itself.
 */
export function exchangeCodeAndProfile(
  code: string,
): Promise<{ grant: TokenGrant; profile: AccountProfile }> {
  return runWithGoogleAuth(
    Effect.gen(function* () {
      const grant = yield* GoogleAuth.exchangeCode(code);
      const profile = yield* GoogleAuth.profileFromToken(grant.accessToken);
      return { grant, profile };
    }),
  );
}
