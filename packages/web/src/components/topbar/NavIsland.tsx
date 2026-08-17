import { Island } from "../Island";
import { SegmentedToggle } from "./SegmentedToggle";
import { DateRangeNavInline } from "./DateRangeNavInline";
import type { DateRange } from "../../features/sync/dateRange";
import type { ViewMode } from "../../features/sync/useDateRange";

interface Props {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  range: DateRange;
  isCurrentPeriod: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

const VIEW_OPTIONS = [
  { value: "week" as const, label: "Week" },
  { value: "month" as const, label: "Month" },
  { value: "all" as const, label: "All" },
];

/**
 * Center island: Week/Month/All segmented control plus the date-range pager,
 * which collapses (max-width + opacity) when "All" is selected.
 */
export const NavIsland = ({
  viewMode,
  onViewModeChange,
  range,
  isCurrentPeriod,
  canGoNext,
  onPrev,
  onNext,
  onToday,
}: Props) => {
  const collapsed = viewMode === "all";

  return (
    <Island>
      <SegmentedToggle
        options={VIEW_OPTIONS}
        value={viewMode}
        onChange={onViewModeChange}
        ariaLabel="Inbox view"
      />
      <span
        aria-hidden
        className={`h-[18px] w-px flex-none bg-gousse-line transition-[opacity,margin] duration-300 ${
          collapsed ? "-ml-2 opacity-0" : ""
        }`}
      />
      <div
        className={`inline-flex items-center overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] ${
          collapsed ? "-mr-2 max-w-0 opacity-0" : "max-w-[320px] opacity-100"
        }`}
      >
        <DateRangeNavInline
          range={range}
          isCurrentPeriod={isCurrentPeriod}
          canGoNext={canGoNext}
          onPrev={onPrev}
          onNext={onNext}
          onToday={onToday}
        />
      </div>
    </Island>
  );
};
