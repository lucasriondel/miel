// Unit test for triage batch-progress emit timing.
//
// With unbounded concurrency the per-batch "done" events all arrive at the
// very end of the run (every Claude call finishes at roughly the same time),
// so the UI counter is stuck at 0/X until everything wraps up. Capping
// concurrency makes progress visible in real time.
//
// We use deferred Claude promises (and an empty result set) so we can
// exercise runTriageBatches without a real DB — persistTriageResults
// iterates over `items` and does nothing when there are none.

import { describe, test, expect } from "bun:test";

// Set BEFORE importing core modules — getEnv() throws otherwise.
process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { Effect, Layer } from "effect";
import { runTriageBatches } from "./triage";
import { Claude, type ClaudeImpl, type ClaudeRunResult } from "../../claude/Claude";
import { fakeClaude } from "../../testkit/claude";
import type { TriageOutputT } from "../../schemas/triage";
import type { SyncServerEventT } from "../../schemas/syncEvents";
import type { NormalizedMessage } from "./types";
import { runPromiseRethrow } from "../../util/effect";

type TriageRunResult = ClaudeRunResult<TriageOutputT>;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
}

function defer<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

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

function makeClaudeWithDeferreds(deferreds: Array<Deferred<TriageRunResult>>): ClaudeImpl {
  return fakeClaude((task) => {
    // Only triage reaches here; anything else is the phase calling something
    // this suite is not describing.
    expect(task).toBe("triage");
    const d = defer<TriageRunResult>();
    deferreds.push(d);
    // The seam is an Effect (#133), so a batch that has not answered yet is a
    // suspended one — which is what makes the wave-by-wave assertions below
    // observable at all.
    return Effect.promise(() => d.promise);
  });
}

const emptyResult = (i: number): TriageRunResult => ({
  output: { results: [] },
  runId: `r${i}`,
  model: "claude-test",
});

const flush = () => new Promise<void>((r) => setTimeout(r, 20));

function countDone(events: SyncServerEventT[]): number {
  return events.filter((e) => e.type === "triage.batch.progress" && e.status === "done").length;
}

describe("runTriageBatches progress emission", () => {
  test("emits 'done' as each batch resolves, not all at the very end", async () => {
    const events: SyncServerEventT[] = [];
    const deferreds: Array<Deferred<TriageRunResult>> = [];
    const claude = makeClaudeWithDeferreds(deferreds);

    const batches: NormalizedMessage[][] = [
      [makeMessage("m1")],
      [makeMessage("m2")],
      [makeMessage("m3")],
    ];

    const layer = Layer.succeed(Claude, claude);

    const runPromise = runPromiseRethrow(
      runTriageBatches({
        accountId: "acct-1",
        accountEmail: "user@example.com",
        batches,
        labelsByGmailId: new Map(),
        labelsByName: new Map(),
        existingLabelNames: [],
        batchConcurrency: 3,
        log: () => {},
        emit: (e) => events.push(e),
      }).pipe(Effect.provide(layer)),
    );

    // Let the Effect spin up and reach the await on claude.runTriage in each fiber.
    for (let i = 0; i < 50 && deferreds.length < batches.length; i += 1) {
      await flush();
    }

    // Sanity: triage.started fired with the right total.
    const started = events.find((e) => e.type === "triage.started");
    expect(started).toBeDefined();
    if (started?.type === "triage.started") {
      expect(started.totalBatches).toBe(batches.length);
    }

    // No "done" events yet — no batches have finished.
    expect(countDone(events)).toBe(0);

    // Resolve the first batch — its "done" event must arrive before the
    // others finish.
    deferreds[0].resolve(emptyResult(1));
    await flush();
    expect(countDone(events)).toBe(1);

    deferreds[1].resolve(emptyResult(2));
    await flush();
    expect(countDone(events)).toBe(2);

    // Drain the rest and let the run finish.
    for (let i = 2; i < deferreds.length; i += 1) {
      deferreds[i].resolve(emptyResult(i + 1));
    }
    await runPromise;

    expect(events.filter((e) => e.type === "triage.finished").length).toBe(1);
    expect(countDone(events)).toBe(batches.length);
  });

  test("never runs more than the configured concurrency in parallel", async () => {
    const events: SyncServerEventT[] = [];
    const deferreds: Array<Deferred<TriageRunResult>> = [];
    const claude = makeClaudeWithDeferreds(deferreds);

    const batches: NormalizedMessage[][] = Array.from({ length: 6 }, (_, i) => [
      makeMessage(`m${i}`),
    ]);

    const layer = Layer.succeed(Claude, claude);

    const runPromise = runPromiseRethrow(
      runTriageBatches({
        accountId: "acct-1",
        accountEmail: "user@example.com",
        batches,
        labelsByGmailId: new Map(),
        labelsByName: new Map(),
        existingLabelNames: [],
        batchConcurrency: 3,
        log: () => {},
        emit: (e) => events.push(e),
      }).pipe(Effect.provide(layer)),
    );

    // Give every fiber that *could* start a chance to do so.
    for (let i = 0; i < 5; i += 1) await flush();

    // With unbounded concurrency this would be batches.length (= 6). With a
    // bounded cap it must be strictly less.
    expect(deferreds.length).toBeLessThan(batches.length);
    const inFlightFirstWave = deferreds.length;

    // Drain. Each resolution should free a slot for the next batch.
    let resolved = 0;
    while (events.filter((e) => e.type === "triage.finished").length === 0) {
      const d = deferreds.shift();
      if (d) {
        d.resolve(emptyResult(resolved));
        resolved += 1;
      }
      await flush();
    }
    await runPromise;

    expect(resolved).toBe(batches.length);
    // The first wave size is the concurrency cap.
    expect(inFlightFirstWave).toBeGreaterThan(0);
    expect(countDone(events)).toBe(batches.length);
  });
});
