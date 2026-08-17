import { Merge, X } from "lucide-react";
import { describeFilterSelection } from "./filterSelection";
import { canMergeSelection } from "./mergePreview";

interface Props {
  count: number;
  /** Filters currently visible — the search box can hide some of the account's. */
  totalCount: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
  /** Opens the merge confirmation; the bar never merges by itself. */
  onMerge: () => void;
  /** True while the confirmation is open or its request is in flight. */
  mergeBusy?: boolean;
}

/**
 * The filters page's bulk bar, mirroring the inbox's {@link ../select/BulkActionBar}:
 * it reports how many filters are selected, offers select-all / clear / exit,
 * and — once the selection is big enough to be a merge — offers to fold the
 * selected filters into one.
 *
 * Below the merge floor the button is absent rather than present-but-disabled:
 * a permanently greyed action on a one-filter selection reads as broken, and
 * the count line right beside it already says what is missing.
 */
export const FilterSelectionBar = ({
  count,
  totalCount,
  allSelected,
  onSelectAll,
  onClear,
  onExit,
  onMerge,
  mergeBusy,
}: Props) => (
  <section
    aria-label="Filter selection"
    className="sticky top-[64px] z-40 flex flex-wrap items-center gap-3 rounded-xl border border-gousse-line bg-gousse-panel/95 px-3 py-2 shadow-gousse-md backdrop-blur"
  >
    <span aria-live="polite" className="text-sm font-semibold tabular-nums text-gousse-ink">
      {describeFilterSelection(count)}
    </span>
    <button
      type="button"
      className="text-xs font-medium text-gousse-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      onClick={allSelected ? onClear : onSelectAll}
      disabled={totalCount === 0}
    >
      {allSelected ? "Clear" : `Select all (${totalCount})`}
    </button>
    {canMergeSelection(count) ? (
      <button
        type="button"
        aria-label={`Merge ${count} filters into one`}
        title="Merge the selected filters into one"
        onClick={onMerge}
        disabled={mergeBusy}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gousse-accent transition-all active:scale-[0.96] hover:bg-gousse-accent/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Merge className="h-4 w-4" aria-hidden />
        Merge
      </button>
    ) : null}
    <button
      type="button"
      aria-label="Exit select mode"
      title="Exit select mode"
      onClick={onExit}
      className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gousse-muted transition-all hover:bg-gousse-line/30 hover:text-gousse-ink active:scale-[0.96]"
    >
      <X className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Done</span>
    </button>
  </section>
);
