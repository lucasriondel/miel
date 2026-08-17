import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { GmailFilter, Label } from "../../api/types";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { useDeleteFilter } from "../../api/filters.hooks";
import { FilterCriteriaTags } from "./FilterCriteriaTags";
import { FilterActionTags } from "./FilterActionTags";
import { FilterRowActions } from "./FilterRowActions";

interface Props {
  filter: GmailFilter;
  labelsByGmailId: Map<string, Label>;
  /** Armed for deletion — the list owns this so only one row confirms at a time. */
  confirming: boolean;
  onRequestConfirm: () => void;
  onCancelConfirm: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

const ColLabel = ({ children }: { children: string }) => (
  <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gousse-muted">
    {children}
  </div>
);

/** One active filter as a borderless two-column ledger card: When → Do. */
export const FilterRow = ({
  filter,
  labelsByGmailId,
  confirming,
  onRequestConfirm,
  onCancelConfirm,
  selectMode,
  selected,
  onToggleSelect,
}: Props) => {
  const deleteFilter = useDeleteFilter();
  const [error, setError] = useState<string | null>(null);
  // As on MessageRow: the per-row delete steps aside while selecting, so a
  // destructive click can't land next to a checkbox.
  const showActions = !selectMode;

  // On success the row vanishes with the refetched list; on failure it stays put
  // and disarms, so the message reads next to a filter that still exists.
  const onConfirm = () => {
    setError(null);
    deleteFilter.mutate(
      { accountId: filter.accountId, gmailFilterId: filter.gmailFilterId },
      {
        onSuccess: () => onCancelConfirm(),
        onError: (err) => {
          setError(apiErrorMessage(err));
          onCancelConfirm();
        },
      },
    );
  };

  return (
    <div className={`filter-card px-4 py-3.5 ${selected ? "ring-2 ring-gousse-accent/40" : ""}`}>
      <div className="flex items-center gap-3">
        {selectMode && (
          <label className="flex shrink-0 items-center">
            <span className="sr-only">Select filter</span>
            <Checkbox checked={!!selected} onChange={() => onToggleSelect?.()} />
          </label>
        )}
        <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr_auto] items-center gap-4">
          <div className="min-w-0">
            <ColLabel>When</ColLabel>
            <FilterCriteriaTags criteria={filter.criteria} />
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-gousse-muted" aria-hidden />
          <div className="min-w-0">
            <ColLabel>Do</ColLabel>
            <FilterActionTags action={filter.action} labelsByGmailId={labelsByGmailId} />
          </div>
          {showActions && (
            <FilterRowActions
              confirming={confirming}
              pending={deleteFilter.isPending}
              onRequestConfirm={onRequestConfirm}
              onCancel={onCancelConfirm}
              onConfirm={onConfirm}
            />
          )}
        </div>
      </div>

      {error ? (
        <p className="mt-2 text-xs text-gousse-high">Could not delete this filter: {error}</p>
      ) : null}
    </div>
  );
};
