// Pure decision function for the automatic-sync scheduler. Extracted so the
// tick logic can be unit-tested without a running timer or DB.

export interface SchedulerTickState {
  enabled: boolean;
  intervalMs: number;
  now: number;
  lastStartedAt: number | null;
  isRunning: boolean;
}

export type SkipReason = "disabled" | "in_flight" | "too_soon";

export type SchedulerDecision = { action: "run" } | { action: "skip"; reason: SkipReason };

export function decideTick(state: SchedulerTickState): SchedulerDecision {
  if (!state.enabled) return { action: "skip", reason: "disabled" };
  if (state.isRunning) return { action: "skip", reason: "in_flight" };
  if (state.lastStartedAt === null) return { action: "run" };
  const elapsed = state.now - state.lastStartedAt;
  if (elapsed >= state.intervalMs) return { action: "run" };
  return { action: "skip", reason: "too_soon" };
}
