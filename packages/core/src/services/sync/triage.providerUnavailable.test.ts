// What a failing triage batch means for the rest of the run (#126).
//
// Two outcomes, and the batch loop has to tell them apart: a provider that
// cannot run stops the sync — syncAll turns that into `sync.provider_unavailable`
// and the "AI is not configured" toast — while any other failure is this
// batch's problem and the remaining batches keep going.
//
// Before #126 the second class swallowed `ProviderNotRunnableError`, so an
// install whose triage task pointed at a keyless hosted vendor reported "N
// failed batches" and no toast, while the identical condition for claude-code
// (no token) stopped the run.
//
// No database: the batches never reach `persistTriageResults`, which is the
// only thing here that would touch one.
import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { Effect, Either, Layer } from "effect";
import { runTriageBatches } from "./triage";
import { Claude } from "../../claude/Claude";
import { claudeThatFails } from "../../testkit/claude";
import { ClaudeAuthError, ClaudeTokenMissingError, ProviderNotRunnableError } from "../../errors";
import type { SyncServerEventT } from "../../schemas/syncEvents";
import type { NormalizedMessage } from "./types";

function makeMessage(id: string): NormalizedMessage {
  return {
    accountId: "acct-1",
    gmailMessageId: id,
    gmailThreadId: `thread-${id}`,
    fromEmail: "sender@example.com",
    fromName: null,
    toEmails: ["me@example.com"],
    subject: `subject ${id}`,
    snippet: `snippet ${id}`,
    bodyText: "",
    bodyHtml: "",
    internalDate: new Date(0),
    rawHeaders: {},
    labelIds: [],
    attachments: [],
  };
}

const runBatches = (err: unknown, events: SyncServerEventT[]) =>
  Effect.runPromise(
    runTriageBatches({
      accountId: "acct-1",
      accountEmail: "user@example.com",
      batches: [[makeMessage("m1")], [makeMessage("m2")]],
      labelsByGmailId: new Map(),
      labelsByName: new Map(),
      existingLabelNames: [],
      batchConcurrency: 2,
      log: () => {},
      emit: (e) => events.push(e),
    }).pipe(
      // The one seam (#133): the fake is the Claude interface itself, injected
      // at the tag sync depends on — no wrapper service in between.
      Effect.provide(Layer.succeed(Claude, claudeThatFails(err))),
      Effect.either,
    ),
  );

const notRunnable = () =>
  new ProviderNotRunnableError({
    task: "triage",
    provider: "anthropic",
    reason: "missing_provider_credential",
    phase: "run",
  });

const tagOf = (err: unknown) => (err as { _tag?: string })._tag;

describe("runTriageBatches", () => {
  test("stops the run when the task's provider has no credential", async () => {
    const events: SyncServerEventT[] = [];

    const result = await runBatches(notRunnable(), events);

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(tagOf(result.left)).toBe("ProviderNotRunnableError");
    }
    // Not counted as a batch that merely failed: the run is over.
    expect(events.some((e) => e.type === "triage.finished")).toBe(false);
  });

  test("stops the run when there is no Claude Code token", async () => {
    const events: SyncServerEventT[] = [];

    const result = await runBatches(new ClaudeTokenMissingError(), events);

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(tagOf(result.left)).toBe("ClaudeTokenMissingError");
    }
    expect(events.some((e) => e.type === "triage.finished")).toBe(false);
  });

  test("stops the run when the CLI rejected its token", async () => {
    const events: SyncServerEventT[] = [];

    const result = await runBatches(new ClaudeAuthError({ detail: "invalid token" }), events);

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(tagOf(result.left)).toBe("ClaudeAuthError");
    }
  });

  test("keeps going when a batch fails for any other reason", async () => {
    const events: SyncServerEventT[] = [];

    const result = await runBatches(new Error("model returned nonsense"), events);

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.failedBatches).toBe(2);
      expect(result.right.errors).toHaveLength(2);
      expect(result.right.errors[0]).toContain("model returned nonsense");
    }
    // The run finished — that is the whole difference from the cases above.
    expect(events.filter((e) => e.type === "triage.finished")).toHaveLength(1);
    expect(
      events.filter((e) => e.type === "triage.batch.progress" && e.status === "failed"),
    ).toHaveLength(2);
  });
});
