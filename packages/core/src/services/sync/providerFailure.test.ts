// The catch sync's AI call sites share (#126).
//
// Each used to carry its own copy of "which failures stop the sync", and those
// copies listed the two Claude tags only — so a call site, like triage,
// swallowed a keyless hosted vendor as one more non-fatal batch error. There is
// one catch now, and this is what it decides: propagate, or hand the message to
// the caller's recovery and let the run continue.
import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { Effect, Result } from "effect";
import { recoverUnlessProviderUnavailable } from "./providerFailure";
import {
  ClaudeAuthError,
  ClaudeTokenMissingError,
  GmailApiError,
  HostedApiError,
  ProviderNotRunnableError,
} from "../../errors";

// The shape a triage batch uses: the message becomes one entry in the run's
// error list, and the batch reports nothing persisted rather than failing.
const recovered = (err: unknown) =>
  Effect.runPromise(
    Effect.fail(err).pipe(
      Effect.catch(
        recoverUnlessProviderUnavailable((message) =>
          Effect.succeed({ persisted: 0, errors: [`triage: ${message}`] }),
        ),
      ),
      Effect.result,
    ),
  );

const tagOf = (err: unknown) => (err as { _tag?: string })._tag;

describe("recoverUnlessProviderUnavailable", () => {
  test("propagates every way the provider can be unavailable", async () => {
    for (const err of [
      new ClaudeTokenMissingError(),
      new ClaudeAuthError({ detail: "invalid token" }),
      new ProviderNotRunnableError({
        task: "promo-extract",
        provider: "openai",
        reason: "missing_provider_credential",
        phase: "run",
      }),
    ]) {
      const result = await recovered(err);

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) expect(tagOf(result.failure)).toBe(tagOf(err));
    }
  });

  test("recovers from a vendor that answered and failed", async () => {
    // `HostedApiError` is the call having happened and been rejected — one
    // batch's problem, not the install's, so the sync carries on.
    const result = await recovered(new HostedApiError({ detail: "429 rate limited" }));

    expect(result).toEqual(Result.succeed({ persisted: 0, errors: ["triage: "] }));
  });

  test("recovers from anything else, with the failure's message", async () => {
    const result = await recovered(new Error("model returned nonsense"));

    expect(result).toEqual(
      Result.succeed({
        persisted: 0,
        errors: ["triage: model returned nonsense"],
      }),
    );
  });

  test("recovers from a tagged failure that is not about the provider", async () => {
    const result = await recovered(new GmailApiError({ op: "labels.list", cause: "500" }));

    expect(Result.isSuccess(result)).toBe(true);
  });
});
