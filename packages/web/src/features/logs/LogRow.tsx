import type { LogEntry } from "../../api/types";
import { formatCounts, formatDuration, statusClass, statusLabel, triggerLabel } from "./formatRun";

interface Props {
  entry: LogEntry;
}

export const LogRow = ({ entry }: Props) => {
  const startedAt = new Date(entry.startedAt);
  const when = startedAt.toLocaleString();

  return (
    <tr className="border-b border-gousse-line/60 last:border-b-0">
      <td className="px-3 py-2 align-top text-gousse-ink">
        <span title={startedAt.toISOString()}>{when}</span>
      </td>
      <td className="px-3 py-2 align-top">
        <span className="rounded-md bg-gousse-line/30 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-gousse-ink">
          {entry.type}
        </span>
      </td>
      <td className="px-3 py-2 align-top text-gousse-ink">{triggerLabel(entry.trigger)}</td>
      <td className="px-3 py-2 align-top text-gousse-muted">{entry.accountEmail ?? "—"}</td>
      <td className="px-3 py-2 align-top">
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusClass(entry.status)}`}
        >
          {statusLabel(entry.status)}
        </span>
        {entry.error ? (
          <p className="mt-1 max-w-md whitespace-pre-line text-xs text-rose-700 dark:text-rose-300">
            {entry.error}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-2 align-top text-gousse-ink">{formatCounts(entry)}</td>
      <td className="px-3 py-2 align-top text-gousse-muted">
        {formatDuration(entry.startedAt, entry.finishedAt)}
      </td>
    </tr>
  );
};
