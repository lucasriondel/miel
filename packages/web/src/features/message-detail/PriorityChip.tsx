import type { Priority } from "../../api/types";
import { cn } from "../../lib/utils";

interface Props {
  priority: Priority;
  className?: string;
}

/**
 * The triage verdict. Priority colors are semantic rather than decorative, so
 * they stay on their own tokens instead of taking the accent (DESIGN.md §1).
 */
const FILL: Record<Priority, string> = {
  high: "bg-gousse-high text-white",
  medium: "bg-gousse-medium text-white",
  low: "bg-gousse-low text-white",
};

export const PriorityChip = ({ priority, className }: Props) => (
  <span
    className={cn(
      "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider shadow-gousse-sm",
      FILL[priority],
      className,
    )}
  >
    {priority}
  </span>
);
