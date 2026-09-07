import { Sheen } from "@/components/ui/sheen";
import {
  formatRangeLabel,
  RANGE_MODE_NOUNS,
  type DateRange,
  type RangeMode,
} from "../../features/sync/dateRange";

interface Props {
  range: DateRange;
  isRunning: boolean;
  /** Fetch the period on screen. */
  onSync: () => void;
  disabled?: boolean;
}

const ReloadIcon = ({ spin }: { spin: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`h-[17px] w-[17px] ${spin ? "animate-spin" : ""}`}
    aria-hidden
  >
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 3v6h-6" />
  </svg>
);

/**
 * The period noun, in a cell as wide as the widest of the three.
 *
 * All three words are rendered into one grid cell, so the cell takes the width
 * of "month" whatever the font or locale, and the two that are not current are
 * hidden — from sight and from the accessible name, which the button sets on
 * itself anyway.
 */
const PeriodNoun = ({ mode }: { mode: RangeMode }) => (
  <span className="relative grid justify-items-center">
    {RANGE_MODE_NOUNS.map((noun) => (
      <span
        key={noun}
        aria-hidden={noun !== mode}
        className={`[grid-area:1/1] ${noun === mode ? "" : "invisible"}`}
      >
        {noun}
      </span>
    ))}
  </span>
);

/**
 * One gradient button: it fetches the period the inbox is showing, and says
 * which one (#152). There is no period of its own to pick and no menu to open
 * first — the pager beside it is the selection, so what a press fetches is what
 * the user is looking at.
 *
 * It names the period twice, in two spellings. The visible one is the bare
 * noun — "Sync week", "Sync month", "Sync year" — because this sits in a bar
 * that also holds the account switcher and the pager, and the pager right
 * beside it already says *which* week. The accessible name is the pager's own
 * full label, where width is not the constraint and the dates are what
 * identify the period.
 *
 * The button keeps one width across all three periods, and that width is the
 * widest noun's rather than a number someone measured once: `PeriodNoun`
 * stacks all three in a single grid cell, so the cell is as wide as "month"
 * and the two shorter words are centred in it. A font, a zoom level or a
 * translation that changes which word is widest changes the width with it.
 * Pulses while the run it started is in flight.
 */
export const SyncButton = ({ range, isRunning, onSync, disabled }: Props) => (
  <button
    type="button"
    onClick={onSync}
    disabled={disabled || isRunning}
    aria-label={`Sync ${formatRangeLabel(range)}`}
    className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-br from-gousse-accent to-gousse-accent/80 px-3 py-2.5 text-[13.5px] font-bold text-white shadow-[0_6px_16px_rgb(var(--gousse-accent)/0.32)] transition-[filter,transform] duration-150 hover:brightness-[1.04] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 sm:px-4 ${
      isRunning ? "sync-running" : ""
    }`}
  >
    <Sheen />
    <ReloadIcon spin={isRunning} />
    <span className="relative hidden sm:inline">Sync</span>
    <PeriodNoun mode={range.mode} />
  </button>
);
