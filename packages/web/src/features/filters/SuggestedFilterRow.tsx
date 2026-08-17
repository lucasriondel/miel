import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import type { Label, SuggestedFilter } from "../../api/types";
import { apiFetch } from "../../api/client";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { LabelBadge } from "../../components/LabelBadge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FilterCriteriaTags } from "./FilterCriteriaTags";

interface Props {
  suggestion: SuggestedFilter;
  /** Existing labels for this account, used to color the proposed label badge. */
  labelsByName: Map<string, Label>;
}

/**
 * One AI-proposed filter, rendered as a row inside the "Proposed by AI" card
 * (ProposedFiltersCard owns the gradient edge + header). Rule and actions share
 * the top line; the reasoning gets the full width underneath, so a long
 * sentence wraps instead of competing with the buttons for space.
 */
export const SuggestedFilterRow = ({ suggestion, labelsByName }: Props) => {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<null | "accept" | "dismiss">(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["filters"] });

  const run = async (kind: "accept" | "dismiss") => {
    setPending(kind);
    setError(null);
    try {
      await apiFetch({
        path: `/filters/suggestions/${suggestion.id}/${kind}`,
        method: "POST",
      });
      await invalidate();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  // The proposed label has no color of its own; borrow it from the matching
  // existing label by name so it reads like the same badge it'll become.
  const matched = labelsByName.get(suggestion.addLabelName.toLowerCase());

  const criteria: Record<string, string> = {};
  if (suggestion.criteriaFrom) criteria.from = suggestion.criteriaFrom;
  if (suggestion.criteriaSubject) criteria.subject = suggestion.criteriaSubject;
  if (suggestion.criteriaQuery) criteria.query = suggestion.criteriaQuery;

  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <FilterCriteriaTags criteria={criteria} />
          <ArrowRight className="h-4 w-4 shrink-0 text-gousse-muted" aria-hidden />
          <LabelBadge
            name={suggestion.addLabelName}
            colorBg={matched?.colorBg ?? null}
            colorFg={matched?.colorFg ?? null}
          />
        </div>

        <div className="filter-row-actions ml-auto flex shrink-0 items-center gap-1.5">
          <Button variant="primary" onClick={() => run("accept")} disabled={pending !== null}>
            {pending === "accept" ? <Spinner /> : null}
            Create
          </Button>
          <Button variant="ghost" onClick={() => run("dismiss")} disabled={pending !== null}>
            {pending === "dismiss" ? <Spinner /> : null}
            Dismiss
          </Button>
        </div>
      </div>

      {suggestion.reasoning ? (
        <p className="mt-1.5 max-w-[62ch] text-xs leading-relaxed text-gousse-muted">
          {suggestion.reasoning}
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-gousse-high">{error}</p> : null}
    </div>
  );
};
