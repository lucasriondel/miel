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
  if (criteria.negatedQuery)
    rows.push({ label: "not", value: criteria.negatedQuery });
  if (criteria.hasAttachment) rows.push({ label: "has", value: "attachment" });
  if (criteria.excludeChats) rows.push({ label: "scope", value: "no chats" });
  return rows;
}

export const FilterCriteriaTags = ({ criteria }: Props) => {
  const rows = buildRows(criteria);
  if (rows.length === 0) {
    return <span className="text-xs text-miel-muted">(no criteria)</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((r) => (
        <span
          key={`${r.label}:${r.value}`}
          className="inline-flex items-center gap-1 rounded-md border border-miel-line bg-miel-bg px-2 py-0.5 text-xs"
        >
          <span className="font-mono uppercase tracking-wide text-miel-muted">
            {r.label}
          </span>
          <span className="text-miel-ink">{r.value}</span>
        </span>
      ))}
    </div>
  );
};
