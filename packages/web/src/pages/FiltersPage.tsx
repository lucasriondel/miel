import { useNavigate, useOutletContext } from "react-router-dom";
import { useAccounts, useFilters, useLabels } from "../api/queries";
import { apiErrorMessage } from "../api/apiErrorMessage";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { TopBar } from "../components/TopBar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BackToInboxButton } from "../components/topbar/BackToInboxButton";
import { AccountFiltersSection } from "../features/filters/AccountFiltersSection";
import type { LayoutContext } from "../App";

export const FiltersPage = () => {
  const { selectedAccountId, sidebarCollapsed, onToggleSidebar } =
    useOutletContext<LayoutContext>();
  const navigate = useNavigate();
  const accounts = useAccounts();
  const filters = useFilters(selectedAccountId);
  const labels = useLabels(selectedAccountId);

  const topBar = (
    <TopBar
      left={
        <>
          {sidebarCollapsed && <SidebarTrigger onClick={onToggleSidebar} />}
          <BackToInboxButton
            onClick={() => navigate(selectedAccountId ? `/account/${selectedAccountId}` : "/")}
          />
        </>
      }
      right={null}
    />
  );

  if (accounts.isLoading || filters.isLoading) {
    return (
      <>
        {topBar}
        <div className="flex items-center gap-2 px-3 pt-4 text-sm text-gousse-muted sm:px-6">
          <Spinner /> Loading filters…
        </div>
      </>
    );
  }
  if (accounts.error || filters.error) {
    return (
      <>
        {topBar}
        <div className="px-3 pt-4 sm:px-6">
          <Empty
            title="Failed to load filters"
            description={apiErrorMessage(accounts.error ?? filters.error)}
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
      <div className="flex flex-1 flex-col gap-6 px-3 pb-6 pt-4 sm:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-balance">Filters</h1>
          <p className="max-w-prose text-sm text-pretty text-gousse-muted">
            Gmail filters synced from this account. AI proposes new filters based on patterns it
            sees during sync — review and create them in one click.
          </p>
          <p className="text-xs tabular-nums text-gousse-muted">
            {totalFilters} filter{totalFilters === 1 ? "" : "s"}
            {totalSuggestions > 0 ? ` · ${totalSuggestions} proposed` : ""}
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
            suggestions={suggestionList}
            labels={labelList}
          />
        )}
      </div>
    </>
  );
};
