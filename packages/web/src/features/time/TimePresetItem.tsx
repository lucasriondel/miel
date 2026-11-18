import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Left: what the choice is called ("Tomorrow morning", "Unsnooze"). */
  label: ReactNode;
  /** Right, muted and tabular: what it resolves to ("Tue 08:00"). */
  detail?: string;
  onSelect: () => void;
  className?: string;
}

/**
 * One line of a time menu (Compose & Reply › Send options): 13px label on the
 * left, the resolved time in 11px muted tabular figures on the right, an 8px
 * corner inside the panel's padding.
 */
export const TimePresetItem = ({ label, detail, onSelect, className }: Props) => (
  <button
    type="button"
    role="menuitem"
    onClick={onSelect}
    className={cn(
      "flex h-8 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[13px] text-gousse-ink transition-colors duration-150 hover:bg-gousse-hover focus-visible:bg-gousse-hover focus-visible:outline-none",
      className,
    )}
  >
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {detail ? (
      <span className="shrink-0 text-[11px] text-gousse-muted tabular-nums">{detail}</span>
    ) : null}
  </button>
);
