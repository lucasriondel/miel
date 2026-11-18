import type { ScheduleStatus } from "../../api/types";

interface Props {
  status: ScheduleStatus;
}

function formatWhen(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "finished in under a minute" / "finished after 3 min" — how long the last run took. */
function duration(started: number, finished: number): string {
  const minutes = Math.round((finished - started) / 60_000);
  return minutes < 1 ? "finished in under a minute" : `finished after ${minutes} min`;
}

/** What the last automatic run was, in one line. */
export function lastRunLine(status: ScheduleStatus): string {
  const { lastStartedAt, lastFinishedAt } = status;
  if (lastStartedAt === null) return "No automatic run yet";
  if (lastFinishedAt === null || lastFinishedAt < lastStartedAt) {
    return `Started ${formatWhen(lastStartedAt)}`;
  }
  return `Last run ${formatWhen(lastStartedAt)} — ${duration(lastStartedAt, lastFinishedAt)}`;
}

/**
 * The read-only status band at the foot of the Automatic sync card: a dot,
 * Idle or Running now, and when the last automatic run happened.
 */
export const ScheduleStatusRow = ({ status }: Props) => (
  <div className="flex flex-wrap items-center gap-2 border-t border-gousse-line bg-gousse-bg px-4 py-2.5 text-xs">
    <span
      aria-hidden
      className={`h-1.5 w-1.5 rounded-full ${
        status.isRunning ? "animate-pulse bg-gousse-medium" : "bg-gousse-subtle"
      }`}
    />
    <span className="font-semibold text-gousse-ink">
      {status.isRunning ? "Running now…" : "Idle"}
    </span>
    <span className="text-gousse-muted tabular-nums">{lastRunLine(status)}</span>
  </div>
);
