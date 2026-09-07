// What a sync's promo extraction does, asserted through the rows a caller reads
// back (#159).
//
// No database and no module mock: the in-memory stores answer `PromoStore`, the
// existing `Claude` fake answers the tag, and the prefilter is the real one —
// which is the point, since "a rejected mail reaches no model call" is a claim
// about the two of them together.
import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { Effect, Exit, Layer } from "effect";
import { Claude, type ClaudeImpl, type ClaudeRunResult } from "../claude/Claude";
import { ClaudeSchemaError, ClaudeTokenMissingError, ProviderNotRunnableError } from "../errors";
import { endOfDayUtc } from "../promoExpiry";
import type { ExtractedPromoT, PromoExtractInputT } from "../schemas/promo";
import { fakeClaude } from "../testkit/claude";
import { expectFailureTag, runExit } from "../testkit/runExit";
import { makeTestStores, type TestStores } from "../testkit/stores";
import {
  extractPromosForMessagesEffect,
  type PromoCandidateMessage,
  type PromoExtractionResult,
} from "./promoCodes";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const EMAIL = "me@example.com";

/**
 * A mail the prefilter accepts — the percentage is the strongest signal there
 * is. The body names its own message so a fake can answer per message.
 */
const promotional = (
  gmailMessageId: string,
  over: Partial<PromoCandidateMessage> = {},
): PromoCandidateMessage => ({
  gmailMessageId,
  fromEmail: "newsletter@email.marketing-cloud.example.com",
  fromName: "Zara",
  subject: "Your 20% weekend",
  bodyText: "",
  bodyHtml: `<style>.x{color:red}</style><p>Take 20% off with code WEEKEND20. ref ${gmailMessageId}</p>`,
  internalDate: new Date("2026-09-05T09:00:00.000Z"),
  ...over,
});

/** A mail with no signal at all — no figure, no code run, no vocabulary. */
const personal = (gmailMessageId: string): PromoCandidateMessage => ({
  gmailMessageId,
  fromEmail: "sam@example.com",
  fromName: "Sam",
  subject: "Lunch tomorrow?",
  bodyText: "Are you free at one? I can book the table by the window.",
  bodyHtml: "",
  internalDate: new Date("2026-09-05T09:00:00.000Z"),
});

const PROMO: ExtractedPromoT = {
  code: "WEEKEND20",
  discount: "20% off",
  terms: "orders over £50, excl. sale",
  expiresAt: "2026-09-06",
  merchant: "Zara",
};

/** Which message a call is about, read off the body the service inlined. */
const about = (input: PromoExtractInputT, gmailMessageId: string) =>
  input.body.includes(`ref ${gmailMessageId}`);

const answering = (
  promosFor: (input: PromoExtractInputT) => ExtractedPromoT[],
  calls?: PromoExtractInputT[],
): ClaudeImpl =>
  fakeClaude((task, input) => {
    expect(task).toBe("promo-extract");
    const typed = input as PromoExtractInputT;
    calls?.push(typed);
    return Effect.succeed<ClaudeRunResult<unknown>>({
      output: { promos: promosFor(typed) },
      runId: "run-1",
      model: "claude-haiku-4-5",
    });
  });

/** Seeded the way the fetch phase leaves things: the mail is upserted first. */
const seed = (messages: readonly PromoCandidateMessage[]): TestStores =>
  makeTestStores({
    mailbox: {
      accounts: [{ id: ACCOUNT, email: EMAIL }],
      messages: messages.map((m) => ({
        accountId: ACCOUNT,
        gmailMessageId: m.gmailMessageId,
        internalDate: m.internalDate,
      })),
    },
  });

const extract = (
  stores: TestStores,
  messages: readonly PromoCandidateMessage[],
  claude: ClaudeImpl,
  log?: (m: string) => void,
) =>
  runExit(
    Effect.provide(
      extractPromosForMessagesEffect({
        accountId: ACCOUNT,
        accountEmail: EMAIL,
        messages,
        log,
      }),
      Layer.merge(stores.layer, Layer.succeed(Claude, claude)),
    ),
  );

const succeeds = async (
  stores: TestStores,
  messages: readonly PromoCandidateMessage[],
  claude: ClaudeImpl,
): Promise<PromoExtractionResult> => {
  const exit = await extract(stores, messages, claude);
  if (Exit.isFailure(exit)) throw new Error(`unexpected failure: ${String(exit.cause)}`);
  return exit.value;
};

/** What a reader of the suggestions gets — the rows, through the store's own read. */
const suggested = (stores: TestStores) =>
  Effect.runPromise(stores.mailbox.promoStore.unsaved({ accountId: ACCOUNT }));

describe("extracting promos from the messages a fetch just upserted", () => {
  test("writes one row per promo the model returned", async () => {
    const messages = [promotional("m1")];
    const stores = seed(messages);

    const result = await succeeds(
      stores,
      messages,
      answering(() => [PROMO, { ...PROMO, code: "WEEKEND30", discount: "30% off" }]),
    );

    expect(result.extracted).toBe(2);
    expect((await suggested(stores)).map((p) => p.code).toSorted()).toEqual([
      "WEEKEND20",
      "WEEKEND30",
    ]);
  });

  test("writes no row when the model answers with an empty array", async () => {
    const messages = [promotional("m1")];
    const stores = seed(messages);

    const result = await succeeds(
      stores,
      messages,
      answering(() => []),
    );

    expect(result.extracted).toBe(0);
    expect(await suggested(stores)).toEqual([]);
  });

  test("a message the prefilter rejects reaches no model call at all", async () => {
    const messages = [personal("m1")];
    const stores = seed(messages);
    const calls: PromoExtractInputT[] = [];

    const result = await succeeds(
      stores,
      messages,
      answering(() => [PROMO], calls),
    );

    expect(calls).toEqual([]);
    expect(result.candidates).toBe(0);
    expect(await suggested(stores)).toEqual([]);
  });

  // One mail per call, never a batch: a batch invites the model to attribute one
  // shop's code to another, which lands in a row the user trusts at a checkout.
  test("makes one model call per candidate, each carrying that mail alone", async () => {
    const messages = [promotional("m1"), promotional("m2"), personal("m3")];
    const stores = seed(messages);
    const calls: PromoExtractInputT[] = [];

    await succeeds(
      stores,
      messages,
      answering(() => [], calls),
    );

    expect(calls).toHaveLength(2);
    expect(calls.filter((c) => about(c, "m1"))).toHaveLength(1);
    expect(calls.filter((c) => about(c, "m2"))).toHaveLength(1);
    // No call carries two mails' text.
    expect(calls.filter((c) => about(c, "m1") && about(c, "m2"))).toEqual([]);
  });

  test("sends the mail's stripped visible text rather than its markup", async () => {
    const messages = [promotional("m1")];
    const stores = seed(messages);
    const calls: PromoExtractInputT[] = [];

    await succeeds(
      stores,
      messages,
      answering(() => [], calls),
    );

    expect(calls[0]?.body).toBe("Take 20% off with code WEEKEND20. ref m1");
    expect(calls[0]?.receivedAt).toBe("2026-09-05T09:00:00.000Z");
    expect(calls[0]?.from).toBe("Zara <newsletter@email.marketing-cloud.example.com>");
    expect(calls[0]?.subject).toBe("Your 20% weekend");
  });

  // An expiry is a date, not an instant: the stored value is the end of that UTC
  // day, so a promo never reads expired while the shop still honours it.
  test("stores an expiry at end of day UTC, and leaves an unstated one null", async () => {
    const messages = [promotional("m1"), promotional("m2")];
    const stores = seed(messages);

    await succeeds(
      stores,
      messages,
      answering((input) =>
        about(input, "m2") ? [{ ...PROMO, code: "NODATE", expiresAt: null }] : [PROMO],
      ),
    );
    const rows = await suggested(stores);

    expect(rows.find((p) => p.code === "WEEKEND20")?.expiresAt).toEqual(
      endOfDayUtc(new Date("2026-09-06T00:00:00.000Z")),
    );
    expect(rows.find((p) => p.code === "NODATE")?.expiresAt).toBeNull();
  });

  test("falls back to the sender's name when the model names no merchant", async () => {
    const messages = [promotional("m1")];
    const stores = seed(messages);

    await succeeds(
      stores,
      messages,
      answering(() => [{ ...PROMO, merchant: null }]),
    );

    expect((await suggested(stores))[0]?.merchant).toBe("Zara");
  });

  test("keys each row to the mail it came out of, as a suggestion", async () => {
    const messages = [promotional("m1")];
    const stores = seed(messages);

    await succeeds(
      stores,
      messages,
      answering(() => [PROMO]),
    );
    const row = (await suggested(stores))[0];

    expect(row?.gmailMessageId).toBe("m1");
    expect(row?.accountId).toBe(ACCOUNT);
    expect(row?.discount).toBe("20% off");
    expect(row?.terms).toBe("orders over £50, excl. sale");
    // Extraction writes a suggestion; saving is the user's own act, later.
    expect(row?.savedAt).toBeNull();
  });
});

describe("when one message's extraction fails", () => {
  // A malformed answer on one marketing mail must never cost a sync that
  // triaged fine.
  test("logs it, skips it, and still writes the other messages' rows", async () => {
    const messages = [promotional("m1"), promotional("m2"), promotional("m3")];
    const stores = seed(messages);
    const logged: string[] = [];

    const result = await extract(
      stores,
      messages,
      fakeClaude((_task, input) => {
        const typed = input as PromoExtractInputT;
        return about(typed, "m2")
          ? Effect.fail(new ClaudeSchemaError({ issue: "promos: expected array", raw: "{}" }))
          : Effect.succeed<ClaudeRunResult<unknown>>({
              output: { promos: [{ ...PROMO, code: about(typed, "m1") ? "ONE" : "THREE" }] },
              runId: "run-1",
              model: "claude-haiku-4-5",
            });
      }),
      (m) => logged.push(m),
    );

    expect(Exit.isSuccess(result)).toBe(true);
    if (Exit.isSuccess(result)) {
      expect(result.value.extracted).toBe(2);
      expect(result.value.errors).toHaveLength(1);
      expect(result.value.errors[0]).toContain("m2");
      // Several tagged failures carry their specifics in fields rather than in
      // a message, so an entry reading `promoExtract(m2): ` would say nothing.
      expect(result.value.errors[0]).toContain("ClaudeSchemaError");
    }
    expect((await suggested(stores)).map((p) => p.code).toSorted()).toEqual(["ONE", "THREE"]);
    expect(logged.some((l) => l.includes("m2"))).toBe(true);
  });
});

describe("when the provider cannot run at all", () => {
  // Not this batch's problem but the install's: the credential and the provider
  // pick are global, so it propagates through the shared combinator and syncAll
  // stops the run — the same way triage and filter-suggest already do.
  test.each([
    ["no Claude Code token", () => new ClaudeTokenMissingError()],
    [
      "a task pointed at a vendor with no key",
      () =>
        new ProviderNotRunnableError({
          task: "promo-extract" as const,
          provider: "openai" as const,
          reason: "missing_provider_credential" as const,
          phase: "run" as const,
        }),
    ],
  ])("propagates %s", async (_name, makeError) => {
    const messages = [promotional("m1")];
    const stores = seed(messages);
    const err = makeError();

    const result = await extract(
      stores,
      messages,
      fakeClaude(() => Effect.fail(err)),
    );

    expectFailureTag(result, (err as { _tag: string })._tag);
    expect(await suggested(stores)).toEqual([]);
  });
});
