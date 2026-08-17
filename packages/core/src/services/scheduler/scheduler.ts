import { createDebug } from "../../util/debug";
import { getScheduleSettings, type ScheduleSettings } from "../settings";
import { syncAll } from "../sync";
import { isSyncInFlight, releaseSyncLock, tryAcquireSyncLock } from "../syncLock";
import { decideTick } from "./decide";

const debug = createDebug("service:scheduler");

const DEFAULT_TICK_MS = 30_000;

// `setInterval` resolves to `Timer | number` under Bun/DOM types; alias it so
// the scheduler is agnostic to which handle it holds.
type SchedulerTimer = ReturnType<typeof setInterval> | number;

export interface SchedulerLogger {
  (msg: string, extra?: Record<string, unknown>): void;
}

export interface Scheduler {
  start(): void;
  stop(): void;
  triggerNow(): Promise<void>;
  isRunning(): boolean;
  lastStartedAt(): number | null;
  lastFinishedAt(): number | null;
}

export interface SchedulerDeps {
  runSync?: (opts: { since?: string }) => Promise<unknown>;
  readSettings?: () => Promise<ScheduleSettings>;
  log?: SchedulerLogger;
  tickIntervalMs?: number;
  now?: () => number;
  setInterval?: (cb: () => void, ms: number) => SchedulerTimer;
  clearInterval?: (t: SchedulerTimer) => void;
  // Injectable for tests. Defaults to the process-wide guard in ../syncLock.
  isSyncInFlight?: () => boolean;
  tryAcquireSyncLock?: () => boolean;
  releaseSyncLock?: () => void;
}

// Boots an in-process scheduler that periodically checks `schedule.enabled` +
// `schedule.interval_minutes` from `app_settings` and kicks off a full
// `syncAll({ trigger: "automatic" })` when the interval has elapsed. Overlap
// with any other in-process sync run (previous automatic tick, manual WS
// trigger, focus-sync) is prevented via the shared `syncLock` module.
export function createScheduler(deps: SchedulerDeps = {}): Scheduler {
  const now = deps.now ?? (() => Date.now());
  const readSettings = deps.readSettings ?? getScheduleSettings;
  const runSync =
    deps.runSync ??
    ((opts: { since?: string }) => syncAll({ trigger: "automatic", since: opts.since }));
  const log: SchedulerLogger =
    deps.log ??
    ((msg, extra) => {
      if (extra !== undefined) console.log(`[scheduler] ${msg}`, extra);
      else console.log(`[scheduler] ${msg}`);
    });
  const tickIntervalMs = deps.tickIntervalMs ?? DEFAULT_TICK_MS;
  const setIntervalFn = deps.setInterval ?? setInterval;
  const clearIntervalFn = deps.clearInterval ?? clearInterval;
  const isBusy = deps.isSyncInFlight ?? isSyncInFlight;
  const tryAcquire = deps.tryAcquireSyncLock ?? tryAcquireSyncLock;
  const release = deps.releaseSyncLock ?? releaseSyncLock;

  let timer: SchedulerTimer | null = null;
  let lastStartedAt: number | null = null;
  let lastFinishedAt: number | null = null;

  const tick = async () => {
    let settings: ScheduleSettings;
    try {
      settings = await readSettings();
    } catch (err) {
      log("failed to read schedule settings", {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const decision = decideTick({
      enabled: settings.enabled,
      intervalMs: settings.intervalMinutes * 60_000,
      now: now(),
      lastStartedAt,
      isRunning: isBusy(),
    });

    debug("tick", { decision, settings, lastStartedAt, running: isBusy() });
    if (decision.action === "skip") return;

    // Belt-and-braces: decideTick already checked isBusy(), but tryAcquire is
    // the source of truth in case a manual WS run slipped in between.
    if (!tryAcquire()) return;
    lastStartedAt = now();
    log("automatic sync starting", {
      since: settings.since,
      intervalMinutes: settings.intervalMinutes,
    });
    try {
      await runSync({ since: settings.since });
      log("automatic sync finished");
    } catch (err) {
      // syncAll handles per-account grant/token failures internally; anything
      // that escapes here is unexpected. Log and move on — the next tick will
      // try again after the interval.
      log("automatic sync errored", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      release();
      lastFinishedAt = now();
    }
  };

  return {
    start() {
      if (timer !== null) return;
      debug("scheduler start", { tickIntervalMs });
      timer = setIntervalFn(() => {
        void tick();
      }, tickIntervalMs);
    },
    stop() {
      if (timer === null) return;
      debug("scheduler stop");
      clearIntervalFn(timer);
      timer = null;
    },
    async triggerNow() {
      await tick();
    },
    isRunning() {
      return isBusy();
    },
    lastStartedAt() {
      return lastStartedAt;
    },
    lastFinishedAt() {
      return lastFinishedAt;
    },
  };
}
