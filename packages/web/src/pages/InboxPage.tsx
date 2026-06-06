import { useOutletContext } from "react-router-dom";
import { useMessages } from "../api/queries";
import { PrioritySection } from "../components/PrioritySection";
import { UntriagedSection } from "../components/UntriagedSection";
import { EmptyState } from "../components/EmptyState";
import { Spinner } from "../components/Spinner";
import { TopBar } from "../components/TopBar";
import { SidebarToggleButton } from "../components/SidebarToggleButton";
import { InboxNav } from "../features/sync/InboxNav";
import { SyncRangeControls } from "../features/sync/SyncRangeControls";
import { InboxFilterSuggestions } from "../features/filters/InboxFilterSuggestions";
import type { ListedMessage, Priority } from "../api/types";
import type { LayoutContext } from "../App";
import type { ViewMode } from "../features/sync/useWeek";

export const InboxPage = () => {
  const ctx = useOutletContext<LayoutContext>();
  const {
    selectedAccountId,
    selectedLabelId,
    weekStartIso,
    weekEndIso,
    selectedAccountEmail,
    week,
    isCurrentWeek,
    canGoNext,
    goPrev,
    goNext,
    goToday,
    viewMode,
    setViewMode,
    sidebarCollapsed,
    onToggleSidebar,
  } = ctx;

  const { data, isLoading, error } = useMessages({
    accountId: selectedAccountId,
    labelId: selectedLabelId,
    limit: 100,
    internalDateFrom: viewMode === "week" ? weekStartIso : undefined,
    internalDateTo: viewMode === "week" ? weekEndIso : undefined,
  });

  return (
    <>
      <TopBar
        left={
          <div className="flex items-center gap-2">
            {sidebarCollapsed && <SidebarToggleButton onToggle={onToggleSidebar} />}
            <InboxNav
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              week={week}
              isCurrentWeek={isCurrentWeek}
              canGoNext={canGoNext}
              onPrev={goPrev}
              onNext={goNext}
              onToday={goToday}
            />
          </div>
        }
        right={<SyncRangeControls accountEmail={selectedAccountEmail} />}
      />
      <div className="flex flex-1 flex-col gap-4 px-3 pb-6 pt-4 sm:px-6">
        {selectedAccountId ? (
          <InboxFilterSuggestions accountId={selectedAccountId} />
        ) : null}
        <InboxBody
          selectedAccountId={selectedAccountId}
          selectedAccountEmail={selectedAccountEmail}
          viewMode={viewMode}
          isLoading={isLoading}
          error={error}
          items={data?.items ?? []}
        />
      </div>
    </>
  );
};

interface InboxBodyProps {
  selectedAccountId: string | undefined;
  selectedAccountEmail: string | undefined;
  viewMode: ViewMode;
  isLoading: boolean;
  error: unknown;
  items: ListedMessage[];
}

const InboxBody = ({
  selectedAccountId,
  selectedAccountEmail,
  viewMode,
  isLoading,
  error,
  items,
}: InboxBodyProps) => {
  if (!selectedAccountId) {
    return (
      <EmptyState
        title="Pick an account"
        description="Choose an account in the sidebar to see triaged messages."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-miel-muted">
        <Spinner /> Loading messages…
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Couldn't load messages"
        description={(error as Error).message}
      />
    );
  }

  if (items.length === 0) {
    return viewMode === "week" ? (
      <EmptyState
        title="No messages this week"
        description="Navigate to another week or run Sync to fetch messages for this range."
      />
    ) : (
      <EmptyState
        title="No messages"
        description="Run Sync to fetch messages for this account."
      />
    );
  }

  const byPriority: Record<Priority, ListedMessage[]> = {
    high: [],
    medium: [],
    low: [],
  };
  const untriaged: ListedMessage[] = [];
  for (const m of items) {
    if (m.priority) byPriority[m.priority].push(m);
    else untriaged.push(m);
  }

  return (
    <div className="flex flex-col gap-6">
      <PrioritySection priority="high" messages={byPriority.high} />
      <PrioritySection priority="medium" messages={byPriority.medium} />
      <PrioritySection priority="low" messages={byPriority.low} />
      <UntriagedSection
        messages={untriaged}
        accountEmail={selectedAccountEmail}
      />
    </div>
  );
};
