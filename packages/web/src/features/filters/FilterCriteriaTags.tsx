import type { GmailFilter } from "../../api/types";

interface Props {
  criteria: GmailFilter["criteria"];
}

interface Row {
  label: string;
  value: string;
}

function buildRows(criteria: GmailFilter["criteria"]): Row[] {
  const rows: Row[] = [];
  if (criteria.from) rows.push({ label: "from", value: criteria.from });
  if (criteria.to) rows.push({ label: "to", value: criteria.to });
  if (criteria.subject) rows.push({ label: "subject", value: criteria.subject });
  if (criteria.query) rows.push({ label: "query", value: criteria.query });
  if (criteria.negatedQuery) rows.push({ label: "not", value: criteria.negatedQuery });
  if (criteria.hasAttachment) rows.push({ label: "has", value: "attachment" });
  if (criteria.excludeChats) rows.push({ label: "scope", value: "no chats" });
  return rows;
}

export const FilterCriteriaTags = ({ criteria }: Props) => {
  const rows = buildRows(criteria);
  if (rows.length === 0) {
    return <span className="text-xs text-gousse-muted">(no criteria)</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((r) => (
        <span
          key={`${r.label}:${r.value}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-gousse-bg px-3 py-1 text-xs shadow-[inset_0_0_0_1px_rgb(var(--gousse-line)/0.8)]"
        >
          <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-gousse-muted">
            {r.label}
          </span>
          <span className="font-medium text-gousse-ink">{r.value}</span>
        </span>
      ))}
    </div>
  );
};
