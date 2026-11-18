import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface Props {
  onClick?: () => void;
  /** Swaps the label for a spinner and `pendingLabel` on the quiet fill, and disables. */
  pending?: boolean;
  pendingLabel?: string;
  /** A leading mark (the Google "G"), kept in both states. */
  mark?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * The gate's one big action: 40px, a 10px corner, the brand ink — and, while
 * whatever it started is under way, the same box on the quiet fill with a
 * spinner, so the button does not jump as it changes state.
 */
export const GateButton = ({
  onClick,
  pending,
  pendingLabel,
  mark,
  className,
  children,
}: Props) => (
  <button
    type="button"
    onClick={onClick}
    disabled={pending}
    className={cn(
      "inline-flex h-10 items-center justify-center gap-2.5 rounded-[10px] pr-[18px] pl-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-gousse-primary/30",
      pending
        ? "cursor-progress bg-gousse-fill text-gousse-muted"
        : "bg-gousse-primary text-gousse-on-primary shadow-[0_1px_2px_rgb(20_32_46/0.15)] hover:bg-gousse-primary-hover active:bg-gousse-primary-pressed",
      className,
    )}
  >
    {mark}
    {pending ? <Spinner size={14} /> : null}
    {pending ? (pendingLabel ?? children) : children}
  </button>
);
