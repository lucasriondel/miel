import { getScheduleSettings } from "../settings";
import type { Scheduler } from "./scheduler";

// The scheduler is created once at API boot, but its live status (last run
// timings, whether a sync is in flight) is only reachable through the handle it
// returns. The REST layer needs those without owning the boot module, so the
// boot module registers the handle here and the status route reads it back.
let activeScheduler: Scheduler | null = null;

export function registerScheduler(scheduler: Scheduler): void {
  activeScheduler = scheduler;
}

export interface ScheduleStatus {
  enabled: boolean;
  lastStartedAt: number | null;
  lastFinishedAt: number | null;
  isRunning: boolean;
}

export interface ScheduleStatusDeps {
  // Injectable for tests. Defaults to the registered handle / real settings.
  scheduler?: Scheduler | null;
  readSettings?: () => Promise<{ enabled: boolean }>;
}

// `enabled` comes from settings (the source of truth the scheduler re-reads each
// tick), the timings come from the live handle. If no scheduler is registered
// (e.g. a test harness or the CLI), timings degrade to null / not-running.
export async function getScheduleStatus(deps: ScheduleStatusDeps = {}): Promise<ScheduleStatus> {
  const scheduler = deps.scheduler ?? activeScheduler;
  const readSettings = deps.readSettings ?? getScheduleSettings;
  const { enabled } = await readSettings();
  return {
    enabled,
    lastStartedAt: scheduler?.lastStartedAt() ?? null,
    lastFinishedAt: scheduler?.lastFinishedAt() ?? null,
    isRunning: scheduler?.isRunning() ?? false,
  };
}

// Test-only: clear the registered handle so cases don't leak into each other.
export function _resetSchedulerRegistryForTests(): void {
  activeScheduler = null;
}
