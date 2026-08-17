// The catch triage and filter-suggest share (#126).
//
// Both used to carry their own copy of "which failures stop the sync", and both
// copies listed the two Claude tags only — so filter-suggest, like triage,
// swallowed a keyless hosted vendor as one more non-fatal batch error. There is
// one catch now, and this is what it decides: propagate, or hand the message to
// the caller's recovery and let the run continue.
import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { Effect, Either } from "effect";
import { recoverUnlessProviderUnavailable } from "./providerFailure";
import {
  ClaudeAuthError,
  ClaudeTokenMissingError,
  GmailApiError,
  HostedApiError,
  ProviderNotRunnableError,
} from "../../errors";

// The shape filter-suggest uses: the message becomes one entry in the run's
// error list, and the run reports zero suggestions rather than failing.
const recovered = (err: unknown) =>
  Effect.runPromise(
    Effect.fail(err).pipe(
      Effect.catchAll(
        recoverUnlessProviderUnavailable((message) =>
          Effect.succeed({ suggestedFilters: 0, errors: [`filterSuggest: ${message}`] }),
        ),
      ),
      Effect.either,
    ),
  );

const tagOf = (err: unknown) => (err as { _tag?: string })._tag;

describe("recoverUnlessProviderUnavailable", () => {
  test("propagates every way the provider can be unavailable", async () => {
    for (const err of [
      new ClaudeTokenMissingError(),
      new ClaudeAuthError({ detail: "invalid token" }),
      new ProviderNotRunnableError({
        task: "filter",
        provider: "openai",
        reason: "missing_provider_credential",
        phase: "run",
      }),
    ]) {
      const result = await recovered(err);

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) expect(tagOf(result.left)).toBe(tagOf(err));
    }
  });

  test("recovers from a vendor that answered and failed", async () => {
    // `HostedApiError` is the call having happened and been rejected — one
    // batch's problem, not the install's, so the sync carries on.
    const result = await recovered(new HostedApiError({ detail: "429 rate limited" }));

    expect(result).toEqual(Either.right({ suggestedFilters: 0, errors: ["filterSuggest: "] }));
  });

  test("recovers from anything else, with the failure's message", async () => {
    const result = await recovered(new Error("model returned nonsense"));

    expect(result).toEqual(
      Either.right({
        suggestedFilters: 0,
        errors: ["filterSuggest: model returned nonsense"],
      }),
    );
  });

  test("recovers from a tagged failure that is not about the provider", async () => {
    const result = await recovered(new GmailApiError({ op: "labels.list", cause: "500" }));

    expect(Either.isRight(result)).toBe(true);
  });
});
