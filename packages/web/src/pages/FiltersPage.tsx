import { useOutletContext } from "react-router-dom";
import { useAccounts, useFilters, useLabels } from "../api/queries";
import { apiErrorMessage } from "../api/apiErrorMessage";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "../features/shell/PageHeader";
import { PageLayout } from "../features/shell/PageLayout";
import { AccountFiltersSection } from "../features/filters/AccountFiltersSection";
import type { LayoutContext } from "../App";

/**
 * The account's real Gmail filters: list, delete, merge.
 *
 * The redesign draws no Filters page, so it takes the shape every page it does
 * draw has — the display title in its own header, then a centred column of
 * hairline cards, the width of Settings' — rather than a look of its own.
 */
export const FiltersPage = () => {
  const { selectedAccountId } = useOutletContext<LayoutContext>();
  const accounts = useAccounts();
  const filters = useFilters(selectedAccountId);
  const labels = useLabels(selectedAccountId);

  const account = accounts.data?.find((a) => a.id === selectedAccountId);
  const filterList = filters.data?.filters ?? [];
  const totalFilters = filterList.length;
  const loading = accounts.isLoading || filters.isLoading;
  const error = accounts.error ?? filters.error;

  return (
    <PageLayout
      header={
        <PageHeader
          title="Filters"
          leading={
            loading || error ? null : (
              <span className="text-[13px] font-medium text-gousse-muted tabular-nums">
                {totalFilters} filter{totalFilters === 1 ? "" : "s"}
              </span>
            )
          }
        />
      }
      bodyClassName="px-5 pt-2 pb-12 sm:px-8"
    >
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
        <p className="max-w-prose text-[13px] text-pretty text-gousse-muted">
          Gmail filters synced from {account ? account.email : "this account"}.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-gousse-muted">
            <Spinner /> Loading filters…
          </div>
        ) : error ? (
          <Empty title="Failed to load filters" description={apiErrorMessage(error)} />
        ) : !account ? (
          <Empty
            title="No account selected"
            description="Pick an account in the sidebar to see its filters."
          />
        ) : (
          <AccountFiltersSection
            // Remount per account so a query typed for one account's filters
            // never carries over to another's list.
            key={account.id}
            account={account}
            filters={filterList}
            labels={labels.data ?? []}
          />
        )}
      </div>
    </PageLayout>
  );
};
