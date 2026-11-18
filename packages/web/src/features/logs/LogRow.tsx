import type { LogEntry } from "../../api/types";
import { formatCounts, formatDuration, statusClass, statusLabel, triggerLabel } from "./formatRun";

interface Props {
  entry: LogEntry;
}

export const LogRow = ({ entry }: Props) => {
  const startedAt = new Date(entry.startedAt);
  const when = startedAt.toLocaleString();

  return (
    <tr className="border-b border-gousse-fill last:border-b-0">
      <td className="px-4 py-2.5 align-top text-gousse-ink">
        <span title={startedAt.toISOString()}>{when}</span>
      </td>
      <td className="px-4 py-2.5 align-top">
        <span className="rounded-md bg-gousse-fill px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-gousse-quiet">
          {entry.type}
        </span>
      </td>
      <td className="px-4 py-2.5 align-top text-gousse-ink">{triggerLabel(entry.trigger)}</td>
      <td className="px-4 py-2.5 align-top text-gousse-muted">{entry.accountEmail ?? "—"}</td>
      <td className="px-4 py-2.5 align-top">
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusClass(entry.status)}`}
        >
          {statusLabel(entry.status)}
        </span>
        {entry.error ? (
          <p className="mt-1 max-w-md whitespace-pre-line text-xs text-gousse-error">
            {entry.error}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-2.5 align-top text-gousse-ink">{formatCounts(entry)}</td>
      <td className="px-4 py-2.5 align-top text-gousse-muted">
        {formatDuration(entry.startedAt, entry.finishedAt)}
      </td>
    </tr>
  );
};
