import type { Account, GmailFilter, Label, SuggestedFilter } from "../../api/types";
import { FilterRow } from "./FilterRow";
import { SuggestedFilterRow } from "./SuggestedFilterRow";

interface Props {
  account: Account;
  filters: GmailFilter[];
  suggestions: SuggestedFilter[];
  labels: Label[];
}

export const AccountFiltersSection = ({
  account,
  filters,
  suggestions,
  labels,
}: Props) => {
  const labelsByGmailId = new Map(labels.map((l) => [l.gmailLabelId, l]));

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between border-b border-miel-line pb-1">
        <h2 className="text-base font-semibold text-miel-ink">{account.email}</h2>
        <span className="text-xs text-miel-muted">
          {filters.length} filter{filters.length === 1 ? "" : "s"}
          {suggestions.length > 0
            ? ` · ${suggestions.length} proposed`
            : ""}
        </span>
      </header>

      {suggestions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-miel-muted">
            Proposed by Claude
          </h3>
          {suggestions.map((s) => (
            <SuggestedFilterRow key={s.id} suggestion={s} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {filters.length === 0 ? (
          <p className="text-sm text-miel-muted">No filters yet.</p>
        ) : (
          filters.map((f) => (
            <FilterRow
              key={f.id}
              filter={f}
              labelsByGmailId={labelsByGmailId}
            />
          ))
        )}
      </div>
    </section>
  );
};
