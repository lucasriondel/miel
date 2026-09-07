import { SegmentedToggle } from "./SegmentedToggle";
import { DateRangeNavInline } from "./DateRangeNavInline";
import type { DateRange, RangeMode } from "../../features/sync/dateRange";

interface Props {
  range: DateRange;
  onViewModeChange: (mode: RangeMode) => void;
  isCurrentPeriod: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

const VIEW_OPTIONS = [
  { value: "week" as const, label: "Week" },
  { value: "month" as const, label: "Month" },
  { value: "year" as const, label: "Year" },
];

/**
 * Week/Month/Year segmented control plus the date-range pager. Centred on the
 * inbox bar at desktop widths, and in the bottom bar below them.
 *
 * Every segment names a period the pager can step, so the pager is always
 * shown (#151). It used to slide away under "All", which had no period of its
 * own; the collapse went with the segment that needed it, and the divider is a
 * plain rule again.
 *
 * Which segment is selected is `range.mode` rather than a prop of its own: the
 * range is built from the URL's view, so a second copy of that answer could
 * only ever disagree with it.
 */
export const PeriodNav = ({
  range,
  onViewModeChange,
  isCurrentPeriod,
  canGoNext,
  onPrev,
  onNext,
  onToday,
}: Props) => (
  <div className="inline-flex items-center gap-2">
    <SegmentedToggle
      options={VIEW_OPTIONS}
      value={range.mode}
      onChange={onViewModeChange}
      ariaLabel="Inbox view"
    />
    <span aria-hidden className="h-[18px] w-px flex-none bg-gousse-line" />
    <DateRangeNavInline
      range={range}
      isCurrentPeriod={isCurrentPeriod}
      canGoNext={canGoNext}
      onPrev={onPrev}
      onNext={onNext}
      onToday={onToday}
    />
  </div>
);
