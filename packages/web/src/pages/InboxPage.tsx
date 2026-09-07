import { useOutletContext, useNavigate } from "react-router-dom";
import { useAllMessages } from "../api/queries";
import { PrioritySection } from "../components/PrioritySection";
import { UntriagedSection } from "../components/UntriagedSection";
import { AllCaughtUp } from "../components/AllCaughtUp";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { MobileBottomBar } from "../components/MobileBottomBar";
import { TopBarStart, TopBarEnd } from "@/components/ui/app-shell";
import { PageTopBar } from "../features/shell/PageTopBar";
import { AccountSwitcher } from "../components/topbar/AccountSwitcher";
import { SyncActions } from "../components/topbar/SyncActions";
import { PeriodNav } from "../components/topbar/PeriodNav";
import { ActionablesLedger } from "../features/ledger/ActionablesLedger";
import { useSelection } from "../features/select/useSelection";
import { SelectModeButton } from "../features/select/SelectModeButton";
import { BulkActionBar } from "../features/select/BulkActionBar";
import type { ListedMessage } from "../api/types";
import type { LayoutContext } from "../App";
import type { RangeMode } from "../features/sync/dateRange";
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
    setViewMode,
  } = ctx;

  const selection = useSelection();

  const {
    items: data,
    isLoading,
    error,
  } = useAllMessages({
    accountId: selectedAccountId,
    labelId: selectedLabelId,
    internalDateFrom: rangeStartIso,
    internalDateTo: rangeEndIso,
  });

  /**
   * A whole category in one gesture (#146). Entering select mode is part of the
   * press rather than something to do first from the top bar — and whether this
   * selects the category or clears it is `toggleMany`'s decision, made against
   * the state it writes.
   */
  const handleToggleCategory = (accountId: string, gmailMessageIds: string[]) => {
    selection.enterSelectMode();
    selection.toggleMany(accountId, gmailMessageIds);
  };

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

  const periodNav = (
    <PeriodNav
      range={range}
      onViewModeChange={setViewMode}
      isCurrentPeriod={isCurrentPeriod}
      canGoNext={canGoNext}
      onPrev={goPrev}
      onNext={goNext}
      onToday={goToday}
    />
  );

  return (
    <>
      <PageTopBar>
        <TopBarStart>
          <AccountSwitcher
            selectedAccountId={selectedAccountId}
            onSelectAccount={handleSelectAccount}
          />
        </TopBarStart>
        {/* Centred on the bar, not between the clusters (the two sides are
            unequal), the way a centred TopBarTitle is — but a row of controls,
            so not the title element. Below `md` it moves to the bottom bar. */}
        <div className="absolute left-1/2 hidden -translate-x-1/2 md:flex">{periodNav}</div>
        <TopBarEnd>
          <SyncActions accountEmail={selectedAccountEmail} range={range} />
        </TopBarEnd>
      </PageTopBar>
      <div className="flex flex-1 flex-col gap-4 pb-24 md:pb-0">
        {selectedAccountId && selection.selectMode && (
          <BulkActionBar
            accountId={selectedAccountId}
            selectedIds={selectedIds}
            totalCount={messageIds.length}
            allSelected={allSelected}
            onSelectAll={() => selection.selectMany(selectedAccountId, messageIds)}
            onClear={selection.clear}
            onExit={selection.exitSelectMode}
          />
        )}
        <InboxBody
          selectedAccountId={selectedAccountId}
          mode={range.mode}
          rangeStartIso={rangeStartIso}
          rangeEndIso={rangeEndIso}
          isLoading={isLoading}
          error={error}
          items={items}
          selectMode={selection.selectMode}
          isSelected={selection.isSelected}
          onToggleSelect={selection.toggle}
          onToggleCategory={handleToggleCategory}
        />
      </div>
      <MobileBottomBar>
        {periodNav}
        <SelectModeButton
          active={selection.selectMode}
          disabled={!selectedAccountId}
          onClick={selection.selectMode ? selection.exitSelectMode : selection.enterSelectMode}
        />
      </MobileBottomBar>
    </>
  );
};

interface InboxBodyProps {
  selectedAccountId: string | undefined;
  mode: RangeMode;
  /** The window the list is showing, which the promo section is scoped to. */
  rangeStartIso: string;
  rangeEndIso: string;
  isLoading: boolean;
  error: unknown;
  items: ListedMessage[];
  selectMode: boolean;
  isSelected: (accountId: string, gmailMessageId: string) => boolean;
  onToggleSelect: (accountId: string, gmailMessageId: string) => void;
  onToggleCategory: (accountId: string, gmailMessageIds: string[]) => void;
}

const InboxBody = ({
  selectedAccountId,
  mode,
  rangeStartIso,
  rangeEndIso,
  isLoading,
  error,
  items,
  selectMode,
  isSelected,
  onToggleSelect,
  onToggleCategory,
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
    return <AllCaughtUp mode={mode} />;
  }

  const buckets = bucketMessages(items);

  // Cumulative offsets so the appear stagger flows high → medium → low → untriaged
  // as one sequence, instead of each section restarting its delay at 0.
  const mediumStart = buckets.high.length;
  const lowStart = mediumStart + buckets.medium.length;
  const untriagedStart = lowStart + buckets.low.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Hidden in select mode: the bulk-action mode stays uncluttered, and
          every act in the ledger is a single-item act that has nothing to say
          about a selection. */}
      {!selectMode && (
        <ActionablesLedger
          accountId={selectedAccountId}
          messages={items}
          internalDateFrom={rangeStartIso}
          internalDateTo={rangeEndIso}
        />
      )}
      <PrioritySection
        accountId={selectedAccountId}
        priority="high"
        messages={buckets.high}
        startIndex={0}
        selectMode={selectMode}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
        onToggleCategory={onToggleCategory}
      />
      <PrioritySection
        accountId={selectedAccountId}
        priority="medium"
        messages={buckets.medium}
        startIndex={mediumStart}
        selectMode={selectMode}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
        onToggleCategory={onToggleCategory}
      />
      <PrioritySection
        accountId={selectedAccountId}
        priority="low"
        messages={buckets.low}
        startIndex={lowStart}
        selectMode={selectMode}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
        onToggleCategory={onToggleCategory}
      />
      <UntriagedSection
        accountId={selectedAccountId}
        messages={buckets.untriaged}
        startIndex={untriagedStart}
        selectMode={selectMode}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
        onToggleCategory={onToggleCategory}
      />
    </div>
  );
};
