import { Effect } from "effect";
import { isProviderUnavailable, type ProviderUnavailableError } from "../../errors";

/**
 * The catch both of sync's AI call sites share (#126).
 *
 * A provider that cannot run is not this batch's failure — it is the install's,
 * and every remaining batch and account would fail the same way — so it
 * propagates out to `syncAll`, which emits `sync.provider_unavailable` once and
 * stops. Anything else (a model that answered nonsense, a Gmail hiccup mid-batch)
 * is handed to `recover` with its message, and the run continues.
 *
 * Which failures are in the first class is {@link isProviderUnavailable}'s
 * answer, not this module's: triage and filter-suggest each used to carry their
 * own copy of the tag list, and only one of the two would have been updated when
 * a third tag arrived.
 */
export const recoverUnlessProviderUnavailable =
  <A, R = never>(recover: (message: string) => Effect.Effect<A, never, R>) =>
  (err: unknown): Effect.Effect<A, ProviderUnavailableError, R> =>
    isProviderUnavailable(err)
      ? Effect.fail(err)
      : recover(err instanceof Error ? err.message : String(err));
