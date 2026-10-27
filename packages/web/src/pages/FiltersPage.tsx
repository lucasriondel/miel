import { useNavigate, useOutletContext } from "react-router-dom";
import { useAccounts, useFilters, useLabels } from "../api/queries";
import { apiErrorMessage } from "../api/apiErrorMessage";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { TopBarStart, TopBarTitle } from "@/components/ui/app-shell";
import { PageTopBar } from "../features/shell/PageTopBar";
import { BackToInboxButton } from "../components/topbar/BackToInboxButton";
import { AccountFiltersSection } from "../features/filters/AccountFiltersSection";
import type { LayoutContext } from "../App";

export const FiltersPage = () => {
  const { selectedAccountId } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();
  const accounts = useAccounts();
  const filters = useFilters(selectedAccountId);
  const labels = useLabels(selectedAccountId);

  const topBar = (
    <PageTopBar>
      <TopBarStart>
        <BackToInboxButton
          onClick={() => navigate(selectedAccountId ? `/account/${selectedAccountId}` : "/")}
        />
      </TopBarStart>
      <TopBarTitle centered>Filters</TopBarTitle>
    </PageTopBar>
  );

  if (accounts.isLoading || filters.isLoading) {
    return (
      <>
        {topBar}
        <div className="flex items-center gap-2 text-sm text-gousse-muted">
          <Spinner /> Loading filters…
        </div>
      </>
    );
  }
  if (accounts.error || filters.error) {
    return (
      <>
        {topBar}
        <Empty
          title="Failed to load filters"
          description={apiErrorMessage(accounts.error ?? filters.error)}
        />
      </>
    );
  }

  const account = accounts.data?.find((a) => a.id === selectedAccountId);
  const filterList = filters.data?.filters ?? [];
  const labelList = labels.data ?? [];

  const totalFilters = filterList.length;

  return (
    <>
      {topBar}
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="max-w-prose text-sm text-pretty text-gousse-muted">
            Gmail filters synced from this account.
          </p>
          <p className="text-xs tabular-nums text-gousse-muted">
            {totalFilters} filter{totalFilters === 1 ? "" : "s"}
          </p>
        </div>

        {!account ? (
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
            labels={labelList}
          />
        )}
      </div>
    </>
  );
};
