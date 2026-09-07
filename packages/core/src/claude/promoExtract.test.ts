// The fourth AI task (#156): one marketing mail in, every discount it carries
// out. Nothing calls it yet, so what is pinned here is the contract a caller
// will get — the prompt it sends, the answers its codec accepts, and that it
// runs through the one `Claude` seam like the other three.
//
// Run: bun test src/claude/promoExtract.test.ts
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { REPLY_BODY_TRUNCATION } from "../claudeUsage";
import { Claude, type ClaudeImpl, type ClaudeRunResult } from "./Claude";
import { fakeClaude } from "../testkit/claude";
import { expectFailureTag, expectSuccess, runExit } from "../testkit/runExit";
import { PromoExtractOutput, type PromoExtractInputT } from "../schemas/promo";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

const { claudeTaskSpec } = await import("./tasks");

const spec = claudeTaskSpec("promo-extract");

const INPUT: PromoExtractInputT = {
  from: "Zara <newsletter@email.marketing-cloud.example.com>",
  subject: "Your 20% weekend",
  receivedAt: "2026-09-05T09:12:00.000Z",
  body: "Take 20% off orders over £50 with code WEEKEND20. Ends Sunday. Sale items excluded.",
};

const PROMOS = {
  promos: [
    {
      code: "WEEKEND20",
      discount: "20% off",
      terms: "orders over £50, excl. sale",
      expiresAt: "2026-09-06",
      merchant: "Zara",
    },
  ],
};

describe("the promo-extract output contract", () => {
  test("takes zero or more promos, an empty array being the negative answer", () => {
    expect(PromoExtractOutput.parse({ promos: [] }).promos).toEqual([]);
    expect(PromoExtractOutput.parse(PROMOS).promos).toHaveLength(1);
  });

  test("keeps only the five extracted fields — there is no confidence score", () => {
    const parsed = PromoExtractOutput.parse({
      promos: [{ ...PROMOS.promos[0], confidence: 0.8 }],
    });

    expect(Object.keys(parsed.promos[0]!).toSorted()).toEqual([
      "code",
      "discount",
      "expiresAt",
      "merchant",
      "terms",
    ]);
  });

  // Four of the five are nullable because a mail routinely states none of them;
  // the headline is what makes it a promo at all.
  test("accepts a nulled code, terms, expiry and merchant, but not a missing discount", () => {
    expect(
      PromoExtractOutput.parse({
        promos: [
          { code: null, discount: "Free shipping", terms: null, expiresAt: null, merchant: null },
        ],
      }).promos,
    ).toHaveLength(1);

    expect(() =>
      PromoExtractOutput.parse({
        promos: [{ code: "X", terms: null, expiresAt: null, merchant: null }],
      }),
    ).toThrow();
  });

  // "Absolute date, never guessed" is the schema's job as much as the prompt's:
  // a promo dated "Sunday" is not a date anyone can act on.
  test("refuses an expiry that is not an absolute calendar date", () => {
    expect(() =>
      PromoExtractOutput.parse({
        promos: [{ ...PROMOS.promos[0], expiresAt: "this Sunday" }],
      }),
    ).toThrow();
  });
});

describe("the promo-extract prompt", () => {
  const prompt = spec.cliPrompt(INPUT);

  test("states the received date, so a relative expiry resolves to an absolute one", () => {
    expect(prompt).toContain("2026-09-05");
  });

  test("inlines the visible text it was handed", () => {
    expect(prompt).toContain("WEEKEND20");
  });

  test("truncates the body at the published reply-drafting limit", () => {
    const long = spec.cliPrompt({ ...INPUT, body: "x".repeat(REPLY_BODY_TRUNCATION + 500) });

    expect(long).toContain("x".repeat(REPLY_BODY_TRUNCATION));
    expect(long).not.toContain("x".repeat(REPLY_BODY_TRUNCATION + 1));
  });

  test("states the discount/terms split rather than leaving it to the model", () => {
    expect(prompt).toContain("discount");
    expect(prompt).toContain("terms");
  });

  test("says an unstated expiry is null rather than a guess", () => {
    expect(prompt.toLowerCase()).toContain("never guess");
  });

  test("names the sender as the merchant's fallback", () => {
    expect(prompt).toContain(INPUT.from);
  });
});

// The seam is the existing one: a suite hands over a `ClaudeImpl` at the tag,
// and the caller gets that task's own output type back — no new injection point
// was added for the fourth task.
describe("running promo-extract through the Claude tag", () => {
  const withClaude = (impl: ClaudeImpl) =>
    runExit(
      Effect.provide(
        Effect.flatMap(Claude, (s) => s.run("promo-extract", INPUT)),
        Layer.succeed(Claude, impl),
      ),
    );

  test("answers with typed promos", async () => {
    const result = expectSuccess(
      await withClaude(
        fakeClaude((task, input) => {
          expect(task).toBe("promo-extract");
          expect(input).toBe(INPUT);
          return Effect.succeed<ClaudeRunResult<unknown>>({
            output: PROMOS,
            runId: "run-1",
            model: "claude-haiku-4-5",
          });
        }),
      ),
    );

    // Typed, not `unknown`: the field access below is the assertion.
    expect(result.output.promos[0]?.code).toBe("WEEKEND20");
  });

  test("a malformed answer is the repo's own schema error", async () => {
    expectFailureTag(
      await runExit(spec.output.decode({ promos: [{ discount: 12 }] })),
      "ClaudeSchemaError",
    );
  });
});
