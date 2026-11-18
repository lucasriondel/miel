// Stopping an AI draft: a generation runs as an interruptible fiber, stopped by
// its request id or by the request's own abort signal.
import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { Effect } from "effect";
import { cancelGeneration, runCancellable } from "./generations";

/** A run that never finishes on its own, and records being interrupted. */
const forever = (log: string[]) =>
  Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => log.push("interrupted"))));

describe("runCancellable", () => {
  test("answers what the run answers when nobody stops it", async () => {
    expect(await runCancellable(Effect.succeed(42), { requestId: "r-ok" })).toBe(42);
    expect(cancelGeneration("r-ok")).toBe(false);
  });

  test("a cancel by request id interrupts the run and answers GenerationCancelledError", async () => {
    const log: string[] = [];
    const running = runCancellable(forever(log), { requestId: "r-1" });
    await Bun.sleep(5);
    expect(cancelGeneration("r-1")).toBe(true);
    await expect(running).rejects.toMatchObject({
      _tag: "GenerationCancelledError",
      requestId: "r-1",
    });
    expect(log).toEqual(["interrupted"]);
  });

  test("the request's own abort signal stops it too", async () => {
    const log: string[] = [];
    const controller = new AbortController();
    const running = runCancellable(forever(log), { signal: controller.signal });
    await Bun.sleep(5);
    controller.abort();
    await expect(running).rejects.toMatchObject({ _tag: "GenerationCancelledError" });
    expect(log).toEqual(["interrupted"]);
  });

  test("a second run under the same id supersedes the first", async () => {
    const log: string[] = [];
    const first = runCancellable(forever(log), { requestId: "r-2" });
    await Bun.sleep(5);
    const second = runCancellable(Effect.succeed("again"), { requestId: "r-2" });
    await expect(first).rejects.toMatchObject({ _tag: "GenerationCancelledError" });
    expect(await second).toBe("again");
  });

  test("a failure that is not a cancel reaches the caller as itself", async () => {
    await expect(runCancellable(Effect.fail(new Error("boom")))).rejects.toThrow("boom");
  });
});
