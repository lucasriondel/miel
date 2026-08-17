import type { LogEntry } from "../../api/types";
import { LogRow } from "./LogRow";

interface Props {
  entries: LogEntry[];
}

export const LogsTable = ({ entries }: Props) => {
  return (
    <div className="overflow-hidden rounded-xl border border-gousse-line bg-gousse-panel shadow-gousse-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gousse-line bg-gousse-bg/40 text-xs uppercase tracking-wide text-gousse-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">When</th>
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="px-3 py-2 font-semibold">Trigger</th>
            <th className="px-3 py-2 font-semibold">Account</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Counts</th>
            <th className="px-3 py-2 font-semibold">Duration</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <LogRow key={`${entry.type}:${entry.id}`} entry={entry} />
          ))}
        </tbody>
      </table>
    </div>
  );
};
