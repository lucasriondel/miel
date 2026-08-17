import { useState, type ReactNode, type RefObject } from "react";
import { PopoverPanel, PopoverTitle } from "../PopoverPanel";
import { SYNC_PRESETS, type SyncPeriod } from "../../features/sync/useSyncPeriod";

interface Props {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  period: SyncPeriod;
  onSelectPreset: (since: string) => void;
  onSelectYear: (year: number) => void;
  onApplyRange: (from: string, to: string) => void;
  onClose: () => void;
}

function todayIso(): string {
  // Local YYYY-MM-DD without pulling in Date.now-sensitive formatting elsewhere.
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Gmail launched in 2004, so no inbox predates it — floor the year list here. */
const GMAIL_LAUNCH_YEAR = 2004;

function yearOptions(now: Date): number[] {
  const current = now.getFullYear();
  const count = current - GMAIL_LAUNCH_YEAR + 1;
  return Array.from({ length: count }, (_, i) => current - i);
}

export const SyncPeriodPopover = ({
  open,
  anchorRef,
  panelRef,
  period,
  onSelectPreset,
  onSelectYear,
  onApplyRange,
  onClose,
}: Props) => {
  const [from, setFrom] = useState(() => (period.kind === "range" ? period.from : todayIso()));
  const [to, setTo] = useState(() => (period.kind === "range" ? period.to : todayIso()));

  const activePreset = period.kind === "preset" ? period.since : null;
  const activeYear = period.kind === "year" ? period.year : null;
  const years = yearOptions(new Date());

  return (
    <PopoverPanel
      open={open}
      anchorRef={anchorRef}
      panelRef={panelRef}
      align="right"
      className="w-[min(19rem,calc(100vw-2rem))] rounded-3xl p-2.5"
    >
      <PopoverTitle>Sync period</PopoverTitle>
      <div className="grid grid-cols-3 gap-1.5 p-1">
        {SYNC_PRESETS.map((preset) => (
          <ChipButton
            key={preset.value}
            active={preset.value === activePreset}
            onClick={() => {
              onSelectPreset(preset.value);
              onClose();
            }}
          >
            {preset.label}
          </ChipButton>
        ))}
      </div>

      <PopoverTitle>Calendar year</PopoverTitle>
      <div className="p-1">
        <YearSelect
          years={years}
          value={activeYear}
          onSelect={(year) => {
            onSelectYear(year);
            onClose();
          }}
        />
      </div>

      <PopoverTitle>Custom range</PopoverTitle>
      <div className="flex gap-2 px-1 pb-1 pt-1">
        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
      </div>

      <button
        type="button"
        disabled={!from || !to || from > to}
        onClick={() => {
          onApplyRange(from, to);
          onClose();
        }}
        className="mx-1 mt-2 w-[calc(100%-0.5rem)] rounded-full bg-gradient-to-br from-gousse-accent to-gousse-accent/80 px-4 py-2.5 text-[13px] font-bold text-white transition-[filter,transform] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] [@media(hover:hover)_and_(pointer:fine)]:hover:brightness-105 active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Sync this range
      </button>
    </PopoverPanel>
  );
};

const ChipButton = ({
  active,
  onClick,
  className = "",
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full border px-3.5 py-2 text-center text-[13px] font-bold transition-[background-color,border-color,color,transform] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:transition-[background-color,border-color,color] motion-reduce:active:scale-100 ${
      active
        ? "border-gousse-accent bg-gousse-accent/15 text-gousse-accent"
        : "border-gousse-line bg-gousse-panel text-gousse-ink [@media(hover:hover)_and_(pointer:fine)]:hover:border-gousse-accent/50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-gousse-accent/[0.06]"
    } ${className}`}
  >
    {children}
  </button>
);

const YearSelect = ({
  years,
  value,
  onSelect,
}: {
  years: number[];
  value: number | null;
  onSelect: (year: number) => void;
}) => (
  <select
    value={value ?? ""}
    onChange={(e) => onSelect(Number(e.target.value))}
    className={`sync-period-select w-full rounded-full border py-2 text-[13px] font-bold tabular-nums transition-[background-color,border-color,color] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] focus:outline focus:outline-2 focus:outline-gousse-accent/40 ${
      value !== null
        ? "border-gousse-accent bg-gousse-accent/15 text-gousse-accent"
        : "border-gousse-line bg-gousse-panel text-gousse-ink [@media(hover:hover)_and_(pointer:fine)]:hover:border-gousse-accent/50"
    }`}
  >
    <option value="" disabled>
      Select a year…
    </option>
    {years.map((year) => (
      <option key={year} value={year}>
        {year}
      </option>
    ))}
  </select>
);

const DateField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) => (
  <label className="flex min-w-0 flex-1 flex-col gap-1">
    <span className="pl-3 text-[10.5px] font-bold uppercase tracking-wide text-gousse-muted">
      {label}
    </span>
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-full border border-gousse-line bg-gousse-bg px-2.5 py-1.5 text-center text-[12.5px] tabular-nums text-gousse-ink [color-scheme:light_dark] focus:border-gousse-accent focus:outline focus:outline-2 focus:outline-gousse-accent/40"
    />
  </label>
);
