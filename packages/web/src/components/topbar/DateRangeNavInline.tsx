import { formatRangeLabel, type DateRange, type RangeMode } from "../../features/sync/dateRange";

/**
 * What the arrows say they step. A record rather than a ternary, so a period
 * added to the vocabulary has to name itself here instead of borrowing "week".
 */
const PERIOD_NOUN: Record<RangeMode, string> = {
  week: "week",
  month: "month",
  year: "year",
};

interface Props {
  range: DateRange;
  isCurrentPeriod: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

const ArrowButton = ({
  dir,
  label,
  onClick,
  disabled,
}: {
  dir: "prev" | "next";
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="inline-flex h-5 w-4 flex-none items-center justify-center rounded text-gousse-muted transition-colors duration-150 hover:text-gousse-ink disabled:cursor-not-allowed disabled:text-gousse-border-strong"
  >
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={dir === "prev" ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"} />
    </svg>
  </button>
);

/**
 * Inline date-range pager (arrows + range + Today) shown inside the nav island,
 * in every one of the three period modes (#151).
 */
export const DateRangeNavInline = ({
  range,
  isCurrentPeriod,
  canGoNext,
  onPrev,
  onNext,
  onToday,
}: Props) => (
  <div className="inline-flex items-center gap-2">
    <div className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-gousse-line bg-gousse-panel px-1.5">
      <ArrowButton dir="prev" label={`Previous ${PERIOD_NOUN[range.mode]}`} onClick={onPrev} />
      <span className="text-center text-[13px] font-medium whitespace-nowrap text-gousse-muted tabular-nums">
        {formatRangeLabel(range)}
      </span>
      <ArrowButton
        dir="next"
        label={`Next ${PERIOD_NOUN[range.mode]}`}
        onClick={onNext}
        disabled={!canGoNext}
      />
    </div>
    {!isCurrentPeriod && (
      <button
        type="button"
        onClick={onToday}
        className="h-7 flex-none rounded-[7px] px-2 text-xs font-semibold text-gousse-muted transition-colors duration-150 hover:bg-gousse-fill hover:text-gousse-ink"
      >
        Today
      </button>
    )}
  </div>
);
