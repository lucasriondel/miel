/**
 * The API process's second loop: work that falls due at a time rather than on
 * a schedule setting — scheduled sends, snoozes waking, and the sweep of
 * uploads no send has spent.
 *
 * Separate from the automatic-sync scheduler (`scheduler/`), which runs only
 * when the user turned automatic sync on: a snooze must wake and a scheduled
 * mail must go whether or not mail is being fetched. Every piece of state is in
 * Postgres, so the loop holds nothing a restart could lose; a tick that finds
 * itself still running when the next one fires is skipped rather than doubled.
 */
import type { GmailDataAdapter } from "../google/gmailAdapter";
import { runWithStores } from "../stores/postgres";
import { createDebug } from "../util/debug";
import { runDueScheduledSendsEffect } from "./scheduledSends";
import { wakeDueSnoozesEffect } from "./snooze";
import { sweepUploadsEffect } from "./uploads";

const debug = createDebug("service:dueWork");

const DEFAULT_TICK_MS = 30_000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

export interface DueWorkLoop {
  start(): void;
  stop(): void;
  /** Run one tick now (tests, and the first tick at boot). */
  tick(): Promise<DueWorkTickResult>;
}

export interface DueWorkTickResult {
  sent: number;
  failed: number;
  retried: number;
  woke: number;
  swept: number;
}

export interface DueWorkDeps {
  tickIntervalMs?: number;
  now?: () => Date;
  gmail?: GmailDataAdapter;
  /** Runs one effect against storage; Postgres by default, the testkit in tests. */
  run?: typeof runWithStores;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export function createDueWorkLoop(deps: DueWorkDeps = {}): DueWorkLoop {
  const now = deps.now ?? (() => new Date());
  const run = deps.run ?? runWithStores;
  const tickMs = deps.tickIntervalMs ?? DEFAULT_TICK_MS;
  const log =
    deps.log ??
    ((msg, extra) => {
      if (extra !== undefined) console.log(`[due-work] ${msg}`, extra);
      else console.log(`[due-work] ${msg}`);
    });
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let lastSweep = 0;

  const tick = async (): Promise<DueWorkTickResult> => {
    const result: DueWorkTickResult = { sent: 0, failed: 0, retried: 0, woke: 0, swept: 0 };
    if (running) return result;
    running = true;
    const at = now();
    try {
      // Each part on its own, so a failing one (a database blip) does not
      // keep the others from running.
      try {
        const sends = await run(runDueScheduledSendsEffect({ now: at, gmail: deps.gmail }));
        for (const s of sends) {
          if (s.outcome === "sent") result.sent += 1;
          else if (s.outcome === "failed") result.failed += 1;
          else result.retried += 1;
        }
      } catch (err) {
        log("scheduled sends errored", { error: err instanceof Error ? err.message : String(err) });
      }
      try {
        result.woke = await run(wakeDueSnoozesEffect({ now: at, gmail: deps.gmail }));
      } catch (err) {
        log("snooze wake errored", { error: err instanceof Error ? err.message : String(err) });
      }
      if (at.getTime() - lastSweep >= SWEEP_EVERY_MS) {
        lastSweep = at.getTime();
        try {
          result.swept = await run(sweepUploadsEffect(at));
        } catch (err) {
          log("upload sweep errored", { error: err instanceof Error ? err.message : String(err) });
        }
      }
      if (result.sent + result.failed + result.retried + result.woke + result.swept > 0) {
        log("tick", { ...result });
      }
      debug("tick", { ...result });
      return result;
    } finally {
      running = false;
    }
  };

  return {
    start() {
      if (timer !== null) return;
      timer = setInterval(() => {
        void tick();
      }, tickMs);
      void tick();
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
    tick,
  };
}
