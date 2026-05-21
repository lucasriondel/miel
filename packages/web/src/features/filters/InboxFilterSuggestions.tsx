import { Link } from "react-router-dom";
import { useFilters } from "../../api/queries";
import { SuggestedFilterRow } from "./SuggestedFilterRow";

interface Props {
  accountId: string;
}

export const InboxFilterSuggestions = ({ accountId }: Props) => {
  const { data } = useFilters(accountId);
  const suggestions = (data?.suggestions ?? []).filter(
    (s) => s.accountId === accountId,
  );

  if (suggestions.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 rounded-md border border-miel-line bg-miel-panel px-3 py-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-miel-muted">
          Proposed by Claude
        </h2>
        <Link to="/filters" className="text-xs text-miel-muted underline">
          Manage filters →
        </Link>
      </header>
      <div className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <SuggestedFilterRow key={s.id} suggestion={s} />
        ))}
      </div>
    </section>
  );
};
