import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export interface Week {
  /** Monday 00:00 in local time. */
  start: Date;
  /** Following Monday 00:00 in local time (exclusive). */
  end: Date;
  /** YYYY-MM-DD for the Monday. */
  key: string;
}

function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = out.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseKey(key: string | null): Date | null {
  if (!key) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? null : startOfWeek(d);
}

function buildWeek(start: Date): Week {
  return { start, end: addDays(start, 7), key: toKey(start) };
}

export function useWeek(): {
  week: Week;
  isCurrentWeek: boolean;
  canGoNext: boolean;
  goPrev: () => void;
  goNext: () => void;
  goToday: () => void;
} {
  const [params, setParams] = useSearchParams();
  const currentWeekStart = useMemo(() => startOfWeek(new Date()), []);
  const week = useMemo<Week>(() => {
    const fromUrl = parseKey(params.get("week"));
    return buildWeek(fromUrl ?? currentWeekStart);
  }, [params, currentWeekStart]);

  const setWeek = useCallback(
    (start: Date) => {
      const next = new URLSearchParams(params);
      next.set("week", toKey(start));
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const isCurrentWeek = week.key === toKey(currentWeekStart);
  const canGoNext = week.start < currentWeekStart;

  const goPrev = useCallback(() => setWeek(addDays(week.start, -7)), [setWeek, week.start]);
  const goNext = useCallback(() => {
    if (!canGoNext) return;
    setWeek(addDays(week.start, 7));
  }, [setWeek, week.start, canGoNext]);
  const goToday = useCallback(() => setWeek(currentWeekStart), [setWeek, currentWeekStart]);

  return { week, isCurrentWeek, canGoNext, goPrev, goNext, goToday };
}
