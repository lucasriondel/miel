// Extracting promo codes from one message, because someone asked (#165).
//
// The sibling suite covers the sync's own extraction; this one is about the
// three ways the manual door deliberately differs from it — no prefilter, a
// re-ask that replaces, and failures that reach the caller instead of a log.
//
// No database and no module mock: the in-memory stores answer the store tags
// and the existing `Claude` fake answers the model.
import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { Effect, Exit, Layer } from "effect";
import { Claude, type ClaudeImpl, type ClaudeRunResult } from "../claude/Claude";
import { ClaudeSchemaError, ProviderNotRunnableError } from "../errors";
import type { ExtractedPromoT, PromoExtractInputT } from "../schemas/promo";
import { fakeClaude } from "../testkit/claude";
import { expectFailureTag, runExit } from "../testkit/runExit";
import { makeTestStores, type TestStores } from "../testkit/stores";
import { extractPromosForMessageEffect, type ExtractPromosForMessageResult } from "./promoCodes";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const EMAIL = "me@example.com";
const MESSAGE = "m1";

const PROMO: ExtractedPromoT = {
  code: "WEEKEND20",
  discount: "20% off",
  terms: "orders over £50",
  expiresAt: "2026-09-06",
  merchant: "Zara",
};

/**
 * A mail with **no** promotional signal whatsoever — the prefilter rejects this
 * one, which is exactly why it is the default fixture here: the manual door is
 * for the mail the sync passed over.
 */
const seed = (over: { bodyHtml?: string; bodyText?: string } = {}): TestStores =>
  makeTestStores({
    mailbox: {
      accounts: [{ id: ACCOUNT, email: EMAIL }],
      messages: [
        {
          accountId: ACCOUNT,
          gmailMessageId: MESSAGE,
          fromEmail: "sam@example.com",
          fromName: "Sam",
          subject: "Lunch tomorrow?",
          bodyText: over.bodyText ?? "Are you free at one? I can book the table.",
          bodyHtml: over.bodyHtml ?? "",
          internalDate: new Date("2026-09-05T09:00:00.000Z"),
        },
      ],
    },
  });

const answering = (promos: ExtractedPromoT[], calls?: PromoExtractInputT[]): ClaudeImpl =>
  fakeClaude((task, input) => {
    expect(task).toBe("promo-extract");
    calls?.push(input as PromoExtractInputT);
    return Effect.succeed<ClaudeRunResult<unknown>>({
      output: { promos },
      runId: "run-1",
      model: "claude-haiku-4-5",
    });
  });

const failing = (error: unknown): ClaudeImpl => fakeClaude(() => Effect.fail(error as never));

const extract = (stores: TestStores, claude: ClaudeImpl) =>
  runExit(
    Effect.provide(
      extractPromosForMessageEffect({ accountId: ACCOUNT, gmailMessageId: MESSAGE }),
      Layer.merge(stores.layer, Layer.succeed(Claude, claude)),
    ),
  );

const succeeds = async (
  stores: TestStores,
  claude: ClaudeImpl,
): Promise<ExtractPromosForMessageResult> => {
  const exit = await extract(stores, claude);
  if (Exit.isFailure(exit)) throw new Error(`unexpected failure: ${String(exit.cause)}`);
  return exit.value;
};

/** The rows as they now stand, through the store's own read. */
const stored = (stores: TestStores) =>
  Effect.runPromise(stores.mailbox.promoStore.unsaved({ accountId: ACCOUNT }));

describe("extracting promos from one message on request", () => {
  test("asks the model even for a mail the prefilter would reject", async () => {
    const stores = seed();
    const calls: PromoExtractInputT[] = [];

    const result = await succeeds(stores, answering([PROMO], calls));

    // The whole point of the manual door: the sync skips this mail entirely.
    expect(calls).toHaveLength(1);
    expect(result.found).toBe(true);
    expect(result.promos.map((p) => p.code)).toEqual(["WEEKEND20"]);
  });

  test("writes what the model answered, expiry stored as the end of that day", async () => {
    const stores = seed();

    await succeeds(stores, answering([PROMO]));

    const rows = await stored(stores);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: "WEEKEND20",
      discount: "20% off",
      terms: "orders over £50",
      merchant: "Zara",
      savedAt: null,
    });
    expect(rows[0]!.expiresAt?.toISOString()).toBe("2026-09-06T23:59:59.999Z");
  });

  test("inlines the mail's stripped HTML, preferring it over the plain part", async () => {
    const stores = seed({
      bodyHtml: "<style>.x{color:red}</style><p>Take 20% off with WEEKEND20</p>",
      bodyText: "view this in your browser",
    });
    const calls: PromoExtractInputT[] = [];

    await succeeds(stores, answering([PROMO], calls));

    expect(calls[0]!.body).toContain("Take 20% off with WEEKEND20");
    // The stylesheet's contents are dropped, not merely untagged.
    expect(calls[0]!.body).not.toContain("color:red");
    expect(calls[0]!.body).not.toContain("view this in your browser");
  });

  test("a second run replaces the first answer rather than adding to it", async () => {
    const stores = seed();

    await succeeds(stores, answering([PROMO]));
    await succeeds(stores, answering([{ ...PROMO, code: "BETTER30", discount: "30% off" }]));

    const rows = await stored(stores);
    expect(rows.map((r) => r.code)).toEqual(["BETTER30"]);
  });

  test("a run that finds nothing clears the previous answer and says so", async () => {
    const stores = seed();
    await succeeds(stores, answering([PROMO]));

    const result = await succeeds(stores, answering([]));

    // "The model now says there is nothing here" is an answer; leaving the old
    // guess up would contradict what the button just reported.
    expect(result.found).toBe(false);
    expect(result.promos).toEqual([]);
    expect(await stored(stores)).toEqual([]);
  });

  test("a re-run leaves a saved promo on the same mail alone", async () => {
    const stores = seed();
    const [first] = await succeeds(stores, answering([PROMO])).then((r) => r.promos);
    await Effect.runPromise(
      stores.mailbox.promoStore.markSaved({
        id: first!.id,
        savedAt: new Date("2026-09-05T12:00:00.000Z"),
        message: {
          subject: "Lunch tomorrow?",
          fromName: "Sam",
          fromEmail: "sam@example.com",
          internalDate: new Date("2026-09-05T09:00:00.000Z"),
          bodyHtml: null,
          bodyText: null,
        },
      }),
    );

    await succeeds(stores, answering([{ ...PROMO, code: "NEWER10" }]));

    // A guess never overwrites a decision: the saved row carries the only copy
    // of a mail the save trashed.
    const saved = await Effect.runPromise(stores.mailbox.promoStore.saved());
    expect(saved.map((r) => r.code)).toEqual(["WEEKEND20"]);
    expect((await stored(stores)).map((r) => r.code)).toEqual(["NEWER10"]);
  });

  test("a provider that cannot run reaches the caller", async () => {
    const stores = seed();

    const exit = await extract(
      stores,
      failing(
        new ProviderNotRunnableError({
          task: "promo-extract",
          provider: "openai",
          reason: "missing_provider_credential",
          phase: "run",
        }),
      ),
    );

    // Not swallowed the way a sync swallows one bad mail: the run *is* this
    // message, so there is nothing to protect and the presser is owed the news.
    expectFailureTag(exit, "ProviderNotRunnableError");
    expect(await stored(stores)).toEqual([]);
  });

  test("an unusable answer reaches the caller too, and writes nothing", async () => {
    const stores = seed();

    const exit = await extract(
      stores,
      failing(new ClaudeSchemaError({ issue: "promos: expected array", raw: "not json" })),
    );

    expectFailureTag(exit, "ClaudeSchemaError");
    expect(await stored(stores)).toEqual([]);
  });

  test("a message that is not stored fails rather than asking the model", async () => {
    const stores = makeTestStores({ mailbox: { accounts: [{ id: ACCOUNT, email: EMAIL }] } });
    const calls: PromoExtractInputT[] = [];

    const exit = await extract(stores, answering([PROMO], calls));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
