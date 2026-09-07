import type { ScheduleStatus } from "../../api/types";

interface Props {
  status: ScheduleStatus;
}

function formatWhen(epochMs: number | null): string {
  if (epochMs === null) return "never";
  const d = new Date(epochMs);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Read-only last-run status for the automatic scheduler. */
export const ScheduleStatusRow = ({ status }: Props) => (
  <div className="flex flex-col gap-1 text-xs text-gousse-muted">
    <div className="flex items-center gap-2">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          status.isRunning ? "animate-pulse bg-gousse-accent" : "bg-gousse-line"
        }`}
      />
      <span className="font-medium text-gousse-ink">
        {status.isRunning ? "Running now…" : "Idle"}
      </span>
    </div>
    <span className="tabular-nums">
      Last started {formatWhen(status.lastStartedAt)} · finished {formatWhen(status.lastFinishedAt)}
    </span>
  </div>
);
