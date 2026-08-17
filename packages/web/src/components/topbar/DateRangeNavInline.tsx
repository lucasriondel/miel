import { formatRangeLabel, type DateRange } from "../../features/sync/dateRange";

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
    className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full text-gousse-muted transition-[background,color,transform] duration-150 hover:bg-gousse-line/50 hover:text-gousse-ink active:scale-90 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
  >
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[15px] w-[15px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={dir === "prev" ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"} />
    </svg>
  </button>
);

/**
 * Inline date-range pager (arrows + range + Today) shown inside the nav island.
 * The parent collapses it via max-width when "All" is selected.
 */
export const DateRangeNavInline = ({
  range,
  isCurrentPeriod,
  canGoNext,
  onPrev,
  onNext,
  onToday,
}: Props) => (
  <div className="inline-flex items-center gap-1">
    <ArrowButton
      dir="prev"
      label={range.mode === "month" ? "Previous month" : "Previous week"}
      onClick={onPrev}
    />
    <span className="min-w-[140px] text-center text-[13px] font-semibold tabular-nums text-gousse-ink">
      {formatRangeLabel(range)}
    </span>
    <ArrowButton
      dir="next"
      label={range.mode === "month" ? "Next month" : "Next week"}
      onClick={onNext}
      disabled={!canGoNext}
    />
    {!isCurrentPeriod && (
      <button
        type="button"
        onClick={onToday}
        className="ml-0.5 flex-none rounded-full border border-gousse-line bg-gousse-bg px-2.5 py-1 text-[11.5px] font-semibold text-gousse-ink transition-[background,transform] duration-150 hover:bg-gousse-accent/10 active:scale-95"
      >
        Today
      </button>
    )}
  </div>
);
