import type { LogEntry } from "../../api/types";
import { LogRow } from "./LogRow";

interface Props {
  entries: LogEntry[];
}

export const LogsTable = ({ entries }: Props) => {
  return (
    <div className="overflow-x-auto rounded-xl border border-gousse-line bg-gousse-panel">
      <table className="w-full text-left text-[13px]">
        <thead className="h-[30px] border-b border-gousse-line bg-gousse-bg text-[11px] uppercase tracking-[0.04em] text-gousse-muted">
          <tr>
            <th className="px-4 py-2 font-medium">When</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Trigger</th>
            <th className="px-4 py-2 font-medium">Account</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Counts</th>
            <th className="px-4 py-2 font-medium">Duration</th>
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
