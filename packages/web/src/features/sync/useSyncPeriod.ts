import { useCallback, useMemo, useState } from "react";
import type { SyncStreamInput } from "../../api/syncSocket";

export interface SyncPreset {
  value: string; // gog `since` token, e.g. "7d"
  label: string;
}

export const SYNC_PRESETS: SyncPreset[] = [
  { value: "1d", label: "1d" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "6mo", label: "6mo" },
  { value: "1y", label: "1y" },
];

const DEFAULT_PRESET = "7d";
const STORAGE_KEY = "miel.sync.period";

interface PresetPeriod {
  kind: "preset";
  since: string;
}
interface RangePeriod {
  kind: "range";
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}
interface YearPeriod {
  kind: "year";
  year: number;
}
export type SyncPeriod = PresetPeriod | RangePeriod | YearPeriod;

function loadPeriod(): SyncPeriod {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SyncPeriod;
      if (parsed.kind === "preset" && typeof parsed.since === "string") return parsed;
      if (
        parsed.kind === "range" &&
        typeof parsed.from === "string" &&
        typeof parsed.to === "string"
      )
        return parsed;
      if (parsed.kind === "year" && Number.isInteger(parsed.year)) return parsed;
    }
  } catch {
    // ignore malformed storage
  }
  return { kind: "preset", since: DEFAULT_PRESET };
}

function savePeriod(period: SyncPeriod) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(period));
  } catch {
    // storage may be unavailable (private mode); selection just won't persist
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const [yStr, mStr, dStr] = iso.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12) return null;
  return { y, m, d };
}

/** Whole days between two date-only points. */
function daysBetween(
  from: { y: number; m: number; d: number },
  to: { y: number; m: number; d: number },
): number {
  const a = Date.UTC(from.y, from.m - 1, from.d);
  const b = Date.UTC(to.y, to.m - 1, to.d);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Short label for the sync split button, e.g. "7d" or "Jun 1–10".
 *
 * Tight ranges keep day precision; spans wider than a month collapse to
 * "Mon – Mon YYYY" (same year) or "Mon YYYY – Mon YYYY" (cross-year) so the
 * label stays narrow enough to render on one line. 31 days is the cutoff
 * because it's the largest span that can still fit inside a single month.
 */
export function periodLabel(period: SyncPeriod): string {
  if (period.kind === "preset") return period.since;
  if (period.kind === "year") return String(period.year);
  const from = parseIsoDate(period.from);
  const to = parseIsoDate(period.to);
  if (!from || !to) return `${period.from}–${period.to}`;
  const fromMon = MONTHS[from.m - 1];
  const toMon = MONTHS[to.m - 1];
  const crossYear = from.y !== to.y;
  const wide = daysBetween(from, to) > 31;
  if (wide && crossYear) return `${fromMon} ${from.y} – ${toMon} ${to.y}`;
  if (wide) return `${fromMon} – ${toMon} ${to.y}`;
  if (crossYear) return `${fromMon} ${from.d}, ${from.y} – ${toMon} ${to.d}, ${to.y}`;
  if (from.m === to.m) return `${fromMon} ${from.d}–${to.d}`;
  return `${fromMon} ${from.d} – ${toMon} ${to.d}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Calendar-year range: Jan 1 → Dec 31, capping `to` at today if the year is the
 * current one (so we don't ask Gmail for dates that haven't happened yet).
 * Compared in the local timezone since the caller uses local `<input type=date>`.
 */
export function yearToRange(year: number, today: Date): { from: string; to: string } {
  const from = `${year}-01-01`;
  if (year === today.getFullYear()) {
    return { from, to: `${year}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}` };
  }
  return { from, to: `${year}-12-31` };
}

/** The payload the sync stream expects for the current period. */
function periodToInput(period: SyncPeriod): Pick<SyncStreamInput, "since" | "range"> {
  if (period.kind === "preset") return { since: period.since };
  if (period.kind === "year") return { range: yearToRange(period.year, new Date()) };
  return { range: { from: period.from, to: period.to } };
}

/**
 * Persisted sync-period selection (preset token or custom from–to range).
 * Backs the sync split button's period picker.
 */
export function useSyncPeriod() {
  const [period, setPeriodState] = useState<SyncPeriod>(loadPeriod);

  const setPreset = useCallback((since: string) => {
    const next: SyncPeriod = { kind: "preset", since };
    setPeriodState(next);
    savePeriod(next);
  }, []);

  const setRange = useCallback((from: string, to: string) => {
    const next: SyncPeriod = { kind: "range", from, to };
    setPeriodState(next);
    savePeriod(next);
  }, []);

  const setYear = useCallback((year: number) => {
    const next: SyncPeriod = { kind: "year", year };
    setPeriodState(next);
    savePeriod(next);
  }, []);

  const label = useMemo(() => periodLabel(period), [period]);
  const syncInput = useMemo(() => periodToInput(period), [period]);

  return { period, setPreset, setRange, setYear, label, syncInput };
}
