import { Cause, Effect, Exit } from "effect";

/**
 * Runs an Effect as a Promise, rethrowing the original failure or defect
 * (not a FiberFailure wrapper) so `instanceof` checks at promise boundaries
 * keep working for callers like the API and CLI.
 */
export async function runPromiseRethrow<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

export function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * Lifts a promise that may reject with a meaningful error (adapters, services
 * crossing the subprocess boundary) into the Effect failure channel, so the
 * error is recoverable with catchAll/either instead of becoming a defect.
 */
export function tryAsync<T>(f: () => Promise<T>): Effect.Effect<T, Error> {
  return Effect.tryPromise({ try: f, catch: toError });
}
