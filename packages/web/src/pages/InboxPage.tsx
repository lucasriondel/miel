import { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import {
  ChevronLeft,
  CircleCheck,
  Clock,
  Inbox as InboxIcon,
  Search as SearchIcon,
} from "lucide-react";
import { useAllMessages } from "../api/queries";
import { snoozedListParams } from "../features/snooze/snoozedListParams";
import { PrioritySection } from "../components/PrioritySection";
import { UntriagedSection } from "../components/UntriagedSection";
import { Empty } from "@/components/ui/empty";
import { MobileBottomBar } from "../components/MobileBottomBar";
import { SyncActions } from "../components/topbar/SyncActions";
import { PeriodNav } from "../components/topbar/PeriodNav";
import { SegmentedToggle } from "../components/topbar/SegmentedToggle";
import { DateRangeNavInline } from "../components/topbar/DateRangeNavInline";
import { AppButton } from "../components/AppButton";
import { PageHeader } from "../features/shell/PageHeader";
import { PageLayout } from "../features/shell/PageLayout";
import { SearchField } from "../features/inbox/SearchField";
import { searchMessages } from "../features/inbox/searchMessages";
import { periodTitle } from "../features/inbox/periodTitle";
import { readingOrder } from "../features/inbox/readingOrder";
import type { ReaderContext } from "../features/inbox/readerContext";
import { InboxEmptyState } from "../features/inbox/InboxEmptyState";
import { InboxSkeleton } from "../features/inbox/InboxSkeleton";
import { formatRangeLabel } from "../features/sync/dateRange";
import { cn } from "@/lib/utils";
import { ActionablesLedger } from "../features/ledger/ActionablesLedger";
import { RowLabelPickerHost } from "../features/labels/RowLabelPickerHost";
import { RowPromosHost } from "../features/promos/RowPromosHost";
import { useSelection } from "../features/select/useSelection";
import { SelectModeButton } from "../features/select/SelectModeButton";
import { BulkActionBar } from "../features/select/BulkActionBar";
import type { ListedMessage } from "../api/types";
import type { LayoutContext } from "../App";
import type { DateRange } from "../features/sync/dateRange";
import type { Mailbox } from "../features/inbox/mailbox";
import { bucketMessages } from "./inboxBuckets";

const VIEW_OPTIONS = [
  { value: "week" as const, label: "Week" },
  { value: "month" as const, label: "Month" },
  { value: "year" as const, label: "Year" },
];

export const InboxPage = () => {
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
    mailbox,
  } = ctx;

  const selection = useSelection();
  const [query, setQuery] = useState("");
  const { pathname } = useLocation();
  // A message open in the reader beside the list (the child route).
  const readerOpen = /\/messages\/[^/]+/.test(pathname);

  const {
    items: data,
    isLoading,
    error,
  } = useAllMessages(
    // Snoozed is every snoozed thread of the account, whatever the period: the
    // date that matters is when it comes back. Spelled exactly as the sidebar's
    // count asks for it, so the two share one cache entry.
    mailbox === "snoozed"
      ? snoozedListParams(selectedAccountId)
      : {
          accountId: selectedAccountId,
          labelId: selectedLabelId,
          internalDateFrom: rangeStartIso,
          internalDateTo: rangeEndIso,
          archivedOnly: mailbox === "done" ? true : undefined,
        },
  );

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

  // Memoised: the list's presence animation keys off the array's identity, and
  // a fresh filtered array every render would restart a leaving row's exit.
  const items = useMemo(() => searchMessages(data, query), [data, query]);
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

  const header = (
    <PageHeader
      title={mailbox === "done" ? "Done" : mailbox === "snoozed" ? "Snoozed" : periodTitle(range)}
      leading={
        // No period to step through in Snoozed: it lists every snoozed thread.
        <span className={cn("hidden", mailbox !== "snoozed" && "@5xl:inline-flex")}>
          <DateRangeNavInline
            range={range}
            isCurrentPeriod={isCurrentPeriod}
            canGoNext={canGoNext}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
          />
        </span>
      }
      center={<SearchField value={query} onChange={setQuery} />}
      trailing={
        <>
          <span className={cn("hidden", mailbox !== "snoozed" && "@3xl:inline-flex")}>
            <SegmentedToggle
              options={VIEW_OPTIONS}
              value={range.mode}
              onChange={setViewMode}
              ariaLabel="Inbox view"
            />
          </span>
          <span className="hidden @4xl:inline-flex">
            <SelectModeButton
              active={selection.selectMode}
              disabled={!selectedAccountId}
              onClick={selection.selectMode ? selection.exitSelectMode : selection.enterSelectMode}
            />
          </span>
          <SyncActions accountEmail={selectedAccountEmail} range={range} />
        </>
      }
    />
  );

  const readerContext: ReaderContext = { readingOrder: readingOrder(items) };

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <PageLayout
        // Below `lg` the reader takes the whole column; the list waits behind it.
        className={cn(readerOpen && "hidden lg:flex")}
        header={header}
        bodyClassName="px-4 pt-[22px] pb-24 sm:px-8 md:pb-8"
      >
        <div className="flex flex-col gap-4">
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
            accountEmail={selectedAccountEmail}
            mailbox={mailbox}
            range={range}
            query={query}
            onClearQuery={() => setQuery("")}
            onWiden={() => setViewMode("year")}
            onPrev={goPrev}
            rangeStartIso={rangeStartIso}
            rangeEndIso={rangeEndIso}
            isLoading={isLoading}
            error={error}
            loadedCount={data.length}
            isCurrentPeriod={isCurrentPeriod}
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
      </PageLayout>
      <Outlet context={readerContext} />
    </div>
  );
};

interface InboxBodyProps {
  selectedAccountId: string | undefined;
  accountEmail: string | undefined;
  mailbox: Mailbox;
  range: DateRange;
  /** The search on screen, and the two ways out of an empty result. */
  query: string;
  onClearQuery: () => void;
  onWiden: () => void;
  onPrev: () => void;
  /** How many the period holds before the search narrows it. */
  loadedCount: number;
  isCurrentPeriod: boolean;
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
  isCurrentPeriod,
  accountEmail,
  mailbox,
  range,
  query,
  onClearQuery,
  onWiden,
  onPrev,
  loadedCount,
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

  if (isLoading) return <InboxSkeleton />;

  if (error) {
    return <Empty title="Couldn't load messages" description={(error as Error).message} />;
  }

  if (items.length === 0) {
    return (
      <InboxEmpty
        accountId={selectedAccountId}
        isCurrentPeriod={isCurrentPeriod}
        accountEmail={accountEmail}
        mailbox={mailbox}
        range={range}
        query={query}
        loadedCount={loadedCount}
        onClearQuery={onClearQuery}
        onWiden={onWiden}
        onPrev={onPrev}
      />
    );
  }

  const buckets = bucketMessages(items);

  // Cumulative offsets so the appear stagger flows high → medium → low → untriaged
  // as one sequence, instead of each section restarting its delay at 0.
  const mediumStart = buckets.high.length;
  const lowStart = mediumStart + buckets.medium.length;
  const untriagedStart = lowStart + buckets.low.length;

  return (
    // One label picker for the whole list (#170), mounted here because this is
    // what renders the rows: a row's trigger says which message it is aimed at,
    // so fifty rows cost fifty buttons rather than fifty popovers, and the
    // account's labels are read once for the list. It wraps the ledger too and
    // costs it nothing — the panel is portalled, so the provider adds no
    // element to the layout. The promos are read once for the list the same
    // way, for the period on screen, and each row draws its own.
    <RowLabelPickerHost>
      <RowPromosHost
        accountId={selectedAccountId}
        internalDateFrom={rangeStartIso}
        internalDateTo={rangeEndIso}
      >
        <div className="flex flex-col gap-[30px]">
          {/* Hidden in select mode: the bulk-action mode stays uncluttered, and
            every act in the ledger is a single-item act that has nothing to say
            about a selection. */}
          {!selectMode && <ActionablesLedger messages={items} />}
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
      </RowPromosHost>
    </RowLabelPickerHost>
  );
};

interface InboxEmptyProps {
  accountId: string;
  isCurrentPeriod: boolean;
  accountEmail: string | undefined;
  mailbox: Mailbox;
  range: DateRange;
  query: string;
  loadedCount: number;
  onClearQuery: () => void;
  onWiden: () => void;
  onPrev: () => void;
}

/**
 * Which empty list this is (Main view › Empty & loading states): a search
 * that matched nothing, a period nothing arrived in, or a period whose mail has
 * all been dealt with. Done has its own sentence — nothing archived yet.
 */
const InboxEmpty = ({
  accountId,
  isCurrentPeriod,
  accountEmail,
  mailbox,
  range,
  query,
  loadedCount,
  onClearQuery,
  onWiden,
  onPrev,
}: InboxEmptyProps) => {
  const navigate = useNavigate();
  const { search } = useLocation();
  const period = `this ${range.mode}`;

  if (query.trim()) {
    return (
      <InboxEmptyState
        icon={<SearchIcon aria-hidden />}
        title={`No mail matches “${query.trim()}”`}
        description={`Search only covers ${period}. Widen the period to Month or Year, or try fewer words — sender, subject and snippet are all searched.`}
        actions={
          <>
            <AppButton onClick={onClearQuery}>Clear search</AppButton>
            {range.mode !== "year" ? (
              <AppButton tone="primary" onClick={onWiden}>
                Search this year
              </AppButton>
            ) : null}
          </>
        }
      />
    );
  }

  if (mailbox === "snoozed") {
    return (
      <InboxEmptyState
        icon={<Clock aria-hidden />}
        title="Nothing snoozed"
        description="Snooze a message to have it come back to the inbox when you need it."
      />
    );
  }

  if (mailbox === "done") {
    return (
      <InboxEmptyState
        icon={<CircleCheck aria-hidden />}
        title={`Nothing done ${period}`}
        description="Messages you archive land here. Archive one from the inbox and it shows up in this list."
      />
    );
  }

  // An inbox list holds no archived mail, so an empty past period and an
  // emptied current one look the same from here: the current period is the one
  // a person has been working through, so it is the one that reads as done.
  if (loadedCount === 0 && !isCurrentPeriod) {
    return (
      <InboxEmptyState
        icon={<InboxIcon aria-hidden />}
        title={`Nothing landed ${period}`}
        description={`No mail arrived in ${accountEmail ?? "this mailbox"} in ${formatRangeLabel(range)}. Sync to pull anything new, or step back to the ${range.mode} before.`}
        actions={
          <AppButton onClick={onPrev}>
            <ChevronLeft aria-hidden />
            Previous {range.mode}
          </AppButton>
        }
      />
    );
  }

  const params = new URLSearchParams(search);
  params.set("mailbox", "done");
  return (
    <InboxEmptyState
      icon={<CircleCheck aria-hidden />}
      title="You’re all caught up"
      description={`Everything from ${period} is archived or done. New mail shows up here on the next sync.`}
      actions={
        <AppButton onClick={() => navigate(`/account/${accountId}?${params.toString()}`)}>
          Open Done
        </AppButton>
      }
    />
  );
};
