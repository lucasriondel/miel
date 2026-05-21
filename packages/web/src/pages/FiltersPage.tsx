import { Link, useOutletContext } from "react-router-dom";
import { useAccounts, useFilters, useLabels } from "../api/queries";
import { ApiError } from "../api/client";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";
import { TopBar } from "../components/TopBar";
import { AccountFiltersSection } from "../features/filters/AccountFiltersSection";
import { SyncRangeControls } from "../features/sync/SyncRangeControls";
import type { LayoutContext } from "../App";

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const FiltersPage = () => {
  const { selectedAccountId, selectedAccountEmail } =
    useOutletContext<LayoutContext>();
  const accounts = useAccounts();
  const filters = useFilters(selectedAccountId);
  const labels = useLabels(selectedAccountId);

  const topBar = (
    <TopBar
      left={
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-miel-muted hover:text-miel-ink"
        >
          ← Back to inbox
        </Link>
      }
      right={<SyncRangeControls accountEmail={selectedAccountEmail} />}
    />
  );

  if (accounts.isLoading || filters.isLoading) {
    return (
      <>
        {topBar}
        <div className="flex items-center gap-2 px-6 pt-4 text-sm text-miel-muted">
          <Spinner /> Loading filters…
        </div>
      </>
    );
  }
  if (accounts.error || filters.error) {
    return (
      <>
        {topBar}
        <div className="px-6 pt-4">
          <EmptyState
            title="Failed to load filters"
            description={describeError(accounts.error ?? filters.error)}
          />
        </div>
      </>
    );
  }

  const account = accounts.data?.find((a) => a.id === selectedAccountId);
  const filterList = filters.data?.filters ?? [];
  const suggestionList = filters.data?.suggestions ?? [];
  const labelList = labels.data ?? [];

  const totalFilters = filterList.length;
  const totalSuggestions = suggestionList.length;

  return (
    <>
      {topBar}
      <div className="flex flex-1 flex-col gap-6 px-6 pb-6 pt-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Filters</h1>
          <p className="text-sm text-miel-muted">
            Gmail filters synced from this account. Claude proposes new filters
            based on patterns it sees during sync — review and create them in
            one click.
          </p>
          <p className="text-xs text-miel-muted">
            {totalFilters} filter{totalFilters === 1 ? "" : "s"}
            {totalSuggestions > 0 ? ` · ${totalSuggestions} proposed` : ""}
          </p>
        </div>

        {!account ? (
          <EmptyState
            title="No account selected"
            description="Pick an account in the sidebar to see its filters."
          />
        ) : (
          <AccountFiltersSection
            account={account}
            filters={filterList}
            suggestions={suggestionList}
            labels={labelList}
          />
        )}
      </div>
    </>
  );
};
