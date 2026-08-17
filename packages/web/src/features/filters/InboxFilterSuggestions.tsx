import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useFilters, useLabels } from "../../api/queries";
import { ProposedFiltersCard } from "./ProposedFiltersCard";

interface Props {
  accountId: string;
}

/**
 * The proposals card embedded on the inbox page — same ProposedFiltersCard as
 * the Filters page, with a link out to manage the rest. The link rides in the
 * card's footer slot rather than under it, so it stays inside the gradient edge
 * instead of reading as a stray element on the page.
 */
export const InboxFilterSuggestions = ({ accountId }: Props) => {
  const { data } = useFilters(accountId);
  const labels = useLabels(accountId);

  const suggestions = (data?.suggestions ?? []).filter((s) => s.accountId === accountId);
  if (suggestions.length === 0) return null;

  const labelsByName = new Map((labels.data ?? []).map((l) => [l.name.toLowerCase(), l]));

  return (
    <section>
      <ProposedFiltersCard
        suggestions={suggestions}
        labelsByName={labelsByName}
        footer={
          <Link
            to="/filters"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-gousse-muted transition-[background-color,color,transform] duration-150 hover:bg-gousse-line/30 hover:text-gousse-ink active:scale-[0.96]"
          >
            Manage filters
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      />
    </section>
  );
};
