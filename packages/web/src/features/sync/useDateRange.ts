import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  buildRange,
  parseRangeKey,
  startOfPeriod,
  stepRange,
  toRangeKey,
  type DateRange,
  type RangeMode,
} from "./dateRange";

export type { DateRange, RangeMode } from "./dateRange";

/** Inbox scope: a calendar period to page through, or every message. */
export type ViewMode = RangeMode | "all";

const VIEW_MODES: ViewMode[] = ["week", "month", "all"];

function parseViewMode(raw: string | null): ViewMode {
  return VIEW_MODES.includes(raw as ViewMode) ? (raw as ViewMode) : "week";
}

export function useDateRange(): {
  range: DateRange;
  isCurrentPeriod: boolean;
  canGoNext: boolean;
  goPrev: () => void;
  goNext: () => void;
  goToday: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
} {
  const [params, setParams] = useSearchParams();
  const viewMode = parseViewMode(params.get("view"));
  // `all` has no period of its own; keep paging on weeks underneath so the
  // pager returns to where it was when the user switches back.
  const rangeMode: RangeMode = viewMode === "all" ? "week" : viewMode;

  const currentStart = useMemo(() => startOfPeriod(new Date(), rangeMode), [rangeMode]);
  const range = useMemo<DateRange>(() => {
    const fromUrl = parseRangeKey(params.get("range"), rangeMode);
    return buildRange(fromUrl ?? currentStart, rangeMode);
  }, [params, currentStart, rangeMode]);

  const setStart = useCallback(
    (start: Date) => {
      const next = new URLSearchParams(params);
      next.set("range", toRangeKey(start));
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      const next = new URLSearchParams(params);
      if (mode === "week") next.delete("view");
      else next.set("view", mode);
      // The stored key belongs to the old period's grid (a Monday vs a 1st),
      // so re-snap it to the new one instead of letting it read as a stale key.
      const current = parseRangeKey(next.get("range"), rangeMode);
      if (current && mode !== "all") next.set("range", toRangeKey(startOfPeriod(current, mode)));
      setParams(next, { replace: true });
    },
    [params, setParams, rangeMode],
  );

  const isCurrentPeriod = range.key === toRangeKey(currentStart);
  const canGoNext = range.start < currentStart;

  const goPrev = useCallback(
    () => setStart(stepRange(range.start, rangeMode, -1)),
    [setStart, range.start, rangeMode],
  );
  const goNext = useCallback(() => {
    if (!canGoNext) return;
    setStart(stepRange(range.start, rangeMode, 1));
  }, [setStart, range.start, rangeMode, canGoNext]);
  const goToday = useCallback(() => setStart(currentStart), [setStart, currentStart]);

  return {
    range,
    isCurrentPeriod,
    canGoNext,
    goPrev,
    goNext,
    goToday,
    viewMode,
    setViewMode,
  };
}
