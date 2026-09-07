import type { Priority } from "../../api/types";
import { priorityInk } from "../../lib/priorityColors";
import { cn } from "../../lib/utils";

interface Props {
  priority: Priority;
  className?: string;
}

/**
 * The triage verdict, as the word itself in its own colour (#141). It used to
 * be a filled pill; a solid shape beside the reasoning read as a second object
 * on the row, and the verdict is emphasis on what is already there. Priority
 * colors are semantic rather than decorative, so they stay on their own tokens
 * instead of taking the accent (DESIGN.md §1) — which token is
 * `lib/priorityColors`' to say, shared with the inbox section header that
 * colours its heading from the same table.
 *
 * The word is never dropped in favour of the colour: it is what a reader who
 * cannot tell the three hues apart has, and what a screen reader announces.
 */
export const PriorityText = ({ priority, className }: Props) => (
  <span
    className={cn(
      "shrink-0 text-xs font-bold uppercase tracking-wider",
      priorityInk(priority),
      className,
    )}
  >
    {priority}
  </span>
);
