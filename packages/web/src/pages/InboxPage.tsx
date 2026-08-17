import { useOutletContext, useNavigate } from "react-router-dom";
import { useAllMessages } from "../api/queries";
import { PrioritySection } from "../components/PrioritySection";
import { UntriagedSection } from "../components/UntriagedSection";
import { AllCaughtUp } from "../components/AllCaughtUp";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { TopBar } from "../components/TopBar";
import { MobileBottomBar } from "../components/MobileBottomBar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AccountIsland } from "../components/topbar/AccountIsland";
import { ActionIsland } from "../components/topbar/ActionIsland";
import { NavIsland } from "../components/topbar/NavIsland";
import { InboxFilterSuggestions } from "../features/filters/InboxFilterSuggestions";
import { VerificationCodeStrip } from "../features/codes/VerificationCodeStrip";
import { useSelection } from "../features/select/useSelection";
import { SelectModeButton } from "../features/select/SelectModeButton";
import { BulkActionBar } from "../features/select/BulkActionBar";
import type { ListedMessage } from "../api/types";
import type { LayoutContext } from "../App";
import type { ViewMode } from "../features/sync/useDateRange";
import { bucketMessages } from "./inboxBuckets";

export const InboxPage = () => {
  const navigate = useNavigate();
  const ctx = useOutletContext<LayoutContext>();
  const {
    selectedAccountId,
    selectedLabelId,
    rangeStartIso,
    rangeEndIso,
    selectedAccountEmail,
    range,
    isCurrentPeriod,
    canGoNext,
    goPrev,
    goNext,
    goToday,
    viewMode,
    setViewMode,
    sidebarCollapsed,
    onToggleSidebar,
  } = ctx;

  const selection = useSelection();

  const {
    items: data,
    isLoading,
    error,
  } = useAllMessages({
    accountId: selectedAccountId,
    labelId: selectedLabelId,
    internalDateFrom: viewMode === "all" ? undefined : rangeStartIso,
    internalDateTo: viewMode === "all" ? undefined : rangeEndIso,
  });

  const handleSelectAccount = (id: string) => {
    selection.exitSelectMode();
    navigate(`/account/${id}`, { replace: true });
  };

  const items = data;
  const messageIds = selectedAccountId
    ? items.filter((m) => m.accountId === selectedAccountId).map((m) => m.gmailMessageId)
    : [];
  const selectedIds = selectedAccountId ? selection.selectionForAccount(selectedAccountId) : [];
  const allSelected = messageIds.length > 0 && selectedIds.length >= messageIds.length;

  const navIsland = (
    <NavIsland
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      range={range}
      isCurrentPeriod={isCurrentPeriod}
      canGoNext={canGoNext}
      onPrev={goPrev}
      onNext={goNext}
      onToday={goToday}
    />
  );
  const selectButton = (
    <SelectModeButton
      active={selection.selectMode}
      disabled={!selectedAccountId}
      onClick={selection.selectMode ? selection.exitSelectMode : selection.enterSelectMode}
    />
  );

  return (
    <>
      <TopBar
        left={
          <>
            {sidebarCollapsed && <SidebarTrigger onClick={onToggleSidebar} />}
            <AccountIsland
              selectedAccountId={selectedAccountId}
              onSelectAccount={handleSelectAccount}
            />
          </>
        }
        center={navIsland}
        centerClassName="hidden sm:flex"
        right={
          <>
            <div className="hidden sm:block">{selectButton}</div>
            <ActionIsland accountEmail={selectedAccountEmail} />
          </>
        }
      />
      <div className="flex flex-1 flex-col gap-4 px-3 pb-24 pt-4 sm:px-6 sm:pb-6">
        {selectedAccountId &&
          (selection.selectMode ? (
            <BulkActionBar
              accountId={selectedAccountId}
              selectedIds={selectedIds}
              totalCount={messageIds.length}
              allSelected={allSelected}
              onSelectAll={() => selection.selectMany(selectedAccountId, messageIds)}
              onClear={selection.clear}
              onExit={selection.exitSelectMode}
            />
          ) : (
            <InboxFilterSuggestions accountId={selectedAccountId} />
          ))}
        <InboxBody
          selectedAccountId={selectedAccountId}
          viewMode={viewMode}
          isLoading={isLoading}
          error={error}
          items={items}
          selectMode={selection.selectMode}
          isSelected={selection.isSelected}
          onToggleSelect={selection.toggle}
        />
      </div>
      <MobileBottomBar>
        {navIsland}
        {selectButton}
      </MobileBottomBar>
    </>
  );
};

interface InboxBodyProps {
  selectedAccountId: string | undefined;
  viewMode: ViewMode;
  isLoading: boolean;
  error: unknown;
  items: ListedMessage[];
  selectMode: boolean;
  isSelected: (accountId: string, gmailMessageId: string) => boolean;
  onToggleSelect: (accountId: string, gmailMessageId: string) => void;
}

const InboxBody = ({
  selectedAccountId,
  viewMode,
  isLoading,
  error,
  items,
  selectMode,
  isSelected,
  onToggleSelect,
}: InboxBodyProps) => {
  if (!selectedAccountId) {
    return (
      <Empty
        title="Pick an account"
        description="Choose an account in the sidebar to see triaged messages."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gousse-muted">
        <Spinner /> Loading messages…
      </div>
    );
  }

  if (error) {
    return <Empty title="Couldn't load messages" description={(error as Error).message} />;
  }

  if (items.length === 0) {
    return <AllCaughtUp viewMode={viewMode} />;
  }

  const buckets = bucketMessages(items);

  // Cumulative offsets so the appear stagger flows high → medium → low → untriaged
  // as one sequence, instead of each section restarting its delay at 0.
  const mediumStart = buckets.high.length;
  const lowStart = mediumStart + buckets.medium.length;
  const untriagedStart = lowStart + buckets.low.length;

  return (
    <div className="flex flex-col gap-6">
      {!selectMode && <VerificationCodeStrip messages={items} />}
      <PrioritySection
        accountId={selectedAccountId}
        priority="high"
        messages={buckets.high}
        startIndex={0}
        selectMode={selectMode}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
      />
      <PrioritySection
        accountId={selectedAccountId}
        priority="medium"
        messages={buckets.medium}
        startIndex={mediumStart}
        selectMode={selectMode}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
      />
      <PrioritySection
        accountId={selectedAccountId}
        priority="low"
        messages={buckets.low}
        startIndex={lowStart}
        selectMode={selectMode}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
      />
      <UntriagedSection
        accountId={selectedAccountId}
        messages={buckets.untriaged}
        startIndex={untriagedStart}
        selectMode={selectMode}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
      />
    </div>
  );
};
