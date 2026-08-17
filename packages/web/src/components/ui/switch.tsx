import { cn } from "@/lib/gousse/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
}

/**
 * Accessible on/off switch — a native <button role="switch"> (keyboard +
 * screen-reader support for free) with `aria-checked`, a track color swap
 * (gousse-accent on / gousse-line off) and a sliding white knob. Behavior ported
 * verbatim from ScheduleToggle's inline switch; the surrounding label copy and
 * the Spinner-while-saving stay in the consuming composite.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
        checked ? "bg-gousse-accent" : "bg-gousse-line",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
