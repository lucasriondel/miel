import { Sheen } from "@/components/ui/sheen";
import { usePopover } from "../../hooks/usePopover";
import { useSyncPeriod, yearToRange } from "../../features/sync/useSyncPeriod";
import { CaretIcon } from "./CaretIcon";
import { SyncPeriodPopover } from "./SyncPeriodPopover";

interface Props {
  isRunning: boolean;
  /** Run a sync for the given period payload (since OR range). */
  onSync: (input: { since?: string; range?: { from: string; to: string } }) => void;
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
 * Gradient split button: the main half runs a sync for the selected period;
 * the trailing half opens the period picker. Pulses while a sync runs.
 */
export const SyncSplitButton = ({ isRunning, onSync, disabled }: Props) => {
  const { open, toggle, close, ref, panelRef } = usePopover();
  const { period, setPreset, setRange, setYear, label, syncInput } = useSyncPeriod();

  return (
    <div ref={ref} className="relative">
      <div
        className={`inline-flex items-stretch overflow-hidden rounded-full shadow-[0_6px_16px_rgb(var(--gousse-accent)/0.32)] ${
          isRunning ? "sync-running" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => onSync(syncInput)}
          disabled={disabled || isRunning}
          aria-label="Sync messages"
          className="group relative inline-flex items-center gap-2 overflow-hidden bg-gradient-to-br from-gousse-accent to-gousse-accent/80 py-2.5 pl-3 pr-3 text-[13.5px] font-bold text-white transition-[filter,transform] duration-150 hover:brightness-[1.04] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 sm:pl-4 sm:pr-2"
        >
          <Sheen />
          <ReloadIcon spin={isRunning} />
          <span className="relative hidden sm:inline">Sync</span>
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Choose sync period"
          className="inline-flex items-center gap-1.5 border-l border-white/25 bg-gradient-to-br from-gousse-accent/80 to-gousse-accent/70 py-2.5 pl-2.5 pr-3 text-[13px] font-bold text-white transition-[filter] duration-150 hover:brightness-105"
        >
          {label}
          <CaretIcon open={open} className="h-3 w-3" />
        </button>
      </div>

      <SyncPeriodPopover
        open={open}
        anchorRef={ref}
        panelRef={panelRef}
        period={period}
        onSelectPreset={setPreset}
        onSelectYear={(year) => {
          setYear(year);
          onSync({ range: yearToRange(year, new Date()) });
        }}
        onApplyRange={(from, to) => {
          setRange(from, to);
          onSync({ range: { from, to } });
        }}
        onClose={close}
      />
    </div>
  );
};
