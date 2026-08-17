/**
 * A `Claude` a suite can answer for (#128, #133).
 *
 * There is one seam for this dependency now, so this is the only fake there is
 * to build: a `ClaudeImpl`, provided at the `Claude` tag with
 * `Layer.succeed(Claude, …)`. No module mock, and nothing wrapping it.
 *
 * The service is one generic method — `run(task, input)` returning that task's
 * output — so a fake is one function. What a fake cannot be is generic: it
 * answers with one task's shape, because the suite handing it over knows which
 * task the code under test calls, and it fails with whatever error that suite
 * is about. Those two mismatches are the single cast below, written once here
 * rather than in every suite that stubs Claude.
 */
import { Effect } from "effect";
import type { ClaudeImpl, ClaudeRunResult } from "../claude/Claude";
import type { ModelTask } from "../providerModels";

export type FakeClaudeRun = (
  task: ModelTask,
  input: unknown,
) => Effect.Effect<ClaudeRunResult<unknown>, unknown>;

export const fakeClaude = (run: FakeClaudeRun): ClaudeImpl => ({
  run: run as unknown as ClaudeImpl["run"],
});

/** A Claude that fails every call the same way — the failure-mapping suites'. */
export const claudeThatFails = (err: unknown): ClaudeImpl => fakeClaude(() => Effect.fail(err));
