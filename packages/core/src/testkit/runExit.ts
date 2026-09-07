/**
 * Test helpers for asserting Effect outcomes under `bun:test`.
 *
 * miel uses `bun:test` (not `@effect/vitest`), so to test an Effect we run it to
 * an `Exit` at the Promise boundary and inspect the result. `expectFailureTag`
 * pulls the first typed failure out of the `Cause` and asserts its `_tag`, which
 * is how we verify a service fails with the *specific* tagged error we expect.
 */
import { Cause, Effect, Exit, Option } from "effect";
import { expect } from "bun:test";

/** Run an Effect to its Exit (success or failure), never throwing. */
export const runExit = <A, E>(eff: Effect.Effect<A, E>): Promise<Exit.Exit<A, E>> =>
  Effect.runPromise(Effect.exit(eff));

/** Assert the Exit is a failure whose first typed error has the given `_tag`. */
export function expectFailureTag(exit: Exit.Exit<unknown, unknown>, tag: string): void {
  expect(Exit.isFailure(exit)).toBe(true);
  if (!Exit.isFailure(exit)) return;
  const opt = Cause.failureOption(exit.cause);
  expect(Option.isSome(opt)).toBe(true);
  if (Option.isNone(opt)) return;
  const value = opt.value as { _tag?: string };
  expect(value._tag).toBe(tag);
}

/** Assert the Exit succeeded and return its value for further assertions. */
export function expectSuccess<A>(exit: Exit.Exit<A, unknown>): A {
  expect(Exit.isSuccess(exit)).toBe(true);
  if (!Exit.isSuccess(exit)) {
    throw new Error("expected success exit");
  }
  return exit.value;
}
