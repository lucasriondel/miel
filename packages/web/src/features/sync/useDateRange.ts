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

/**
 * The inbox's scope is a calendar period and nothing else (#151), so the view
 * mode *is* the range mode — there is no longer an "all" that has no period of
 * its own, and `range.mode` is the one place the selection is read from.
 */
const VIEW_MODES: RangeMode[] = ["week", "month", "year"];

/**
 * `all` was the retired third segment. A bookmark or a tab opened before #151
 * still carries it, so it resolves to the period nearest what it meant rather
 * than blanking the list; anything else falls back to the default week.
 */
function parseViewMode(raw: string | null): RangeMode {
  if (raw === "all") return "year";
  return VIEW_MODES.includes(raw as RangeMode) ? (raw as RangeMode) : "week";
}

export function useDateRange(): {
  range: DateRange;
  isCurrentPeriod: boolean;
  canGoNext: boolean;
  goPrev: () => void;
  goNext: () => void;
  goToday: () => void;
  setViewMode: (mode: RangeMode) => void;
} {
  const [params, setParams] = useSearchParams();
  const mode = parseViewMode(params.get("view"));

  const currentStart = useMemo(() => startOfPeriod(new Date(), mode), [mode]);
  const range = useMemo<DateRange>(() => {
    const fromUrl = parseRangeKey(params.get("range"), mode);
    return buildRange(fromUrl ?? currentStart, mode);
  }, [params, currentStart, mode]);

  const setStart = useCallback(
    (start: Date) => {
      const next = new URLSearchParams(params);
      next.set("range", toRangeKey(start));
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const setViewMode = useCallback(
    (to: RangeMode) => {
      const next = new URLSearchParams(params);
      if (to === "week") next.delete("view");
      else next.set("view", to);
      // The stored key belongs to the old period's grid (a Monday vs a 1st vs
      // a January), so re-snap it to the new one instead of letting it read as
      // a stale key.
      const current = parseRangeKey(next.get("range"), mode);
      if (current) next.set("range", toRangeKey(startOfPeriod(current, to)));
      setParams(next, { replace: true });
    },
    [params, setParams, mode],
  );

  const isCurrentPeriod = range.key === toRangeKey(currentStart);
  const canGoNext = range.start < currentStart;

  const goPrev = useCallback(
    () => setStart(stepRange(range.start, mode, -1)),
    [setStart, range.start, mode],
  );
  const goNext = useCallback(() => {
    if (!canGoNext) return;
    setStart(stepRange(range.start, mode, 1));
  }, [setStart, range.start, mode, canGoNext]);
  const goToday = useCallback(() => setStart(currentStart), [setStart, currentStart]);

  return {
    range,
    isCurrentPeriod,
    canGoNext,
    goPrev,
    goNext,
    goToday,
    setViewMode,
  };
}
