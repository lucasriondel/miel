/**
 * Stopping an AI draft the user no longer wants (A21).
 *
 * The compose window's Stop (and Esc) used to abort only the browser's fetch:
 * the `claude -p` subprocess or the vendor request kept running, and kept
 * spending, until it finished on its own. A generation is now run as an
 * interruptible fiber, keyed by a request id the client chooses, and either of
 * two things stops it:
 *
 * - `cancelGeneration(requestId)` — what `POST /compose/generations/:id/cancel`
 *   calls, for a client that wants to say so explicitly;
 * - the HTTP request's own abort signal — a client that simply drops the fetch.
 *
 * Interrupting the fiber closes the scope the CLI subprocess was spawned in,
 * which kills it, and aborts the signal the hosted call was handed. The caller
 * that was waiting gets a `GenerationCancelledError`.
 *
 * The registry is per process, which is the scope a generation lives in: it
 * runs inside the request that started it.
 */
import { Cause, Effect, Exit } from "effect";
import { GenerationCancelledError } from "../errors";
import type { Stores } from "../stores/contracts";
import { StoresLive } from "../stores/postgres";
import { createDebug } from "../util/debug";

const debug = createDebug("service:generations");

const inFlight = new Map<string, AbortController>();

/** What may stop a run: a client-chosen id, and the request's own abort signal. */
export interface Cancellation {
  requestId?: string;
  signal?: AbortSignal;
}

/**
 * Run an effect against Postgres as an interruptible generation. A second run
 * under an id still in flight supersedes the first — a "Regenerate" pressed
 * twice must not leave the earlier one spending.
 */
export async function runCancellable<A, E>(
  eff: Effect.Effect<A, E, Stores>,
  cancel?: Cancellation,
): Promise<A> {
  const controller = new AbortController();
  const id = cancel?.requestId;
  if (id) {
    inFlight.get(id)?.abort();
    inFlight.set(id, controller);
  }
  const onAbort = () => controller.abort();
  cancel?.signal?.addEventListener("abort", onAbort, { once: true });
  if (cancel?.signal?.aborted) controller.abort();
  try {
    const exit = await Effect.runPromiseExit(Effect.provide(eff, StoresLive), {
      signal: controller.signal,
    });
    if (Exit.isSuccess(exit)) return exit.value;
    if (Cause.hasInterruptsOnly(exit.cause)) {
      debug("generation cancelled", { requestId: id });
      throw new GenerationCancelledError({ requestId: id ?? null });
    }
    throw Cause.squash(exit.cause);
  } finally {
    cancel?.signal?.removeEventListener("abort", onAbort);
    if (id && inFlight.get(id) === controller) inFlight.delete(id);
  }
}

/** Stop the generation running under `requestId`; false when none is. */
export function cancelGeneration(requestId: string): boolean {
  const controller = inFlight.get(requestId);
  if (!controller) return false;
  controller.abort();
  inFlight.delete(requestId);
  return true;
}
