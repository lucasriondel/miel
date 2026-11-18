import type { Priority } from "../api/types";
import { cn } from "@/lib/utils";

/**
 * The three ascending bars the priority picker wears (UI System › Priority
 * Picker): as many filled as the level is high — three for high, two for
 * medium, one for low — in the level's own colour, the rest in the border grey.
 */
const FILLED: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
const COLOR: Record<Priority, string> = {
  high: "bg-gousse-high",
  medium: "bg-gousse-medium",
  low: "bg-gousse-subtle",
};
const HEIGHTS = ["h-1", "h-[7px]", "h-2.5"];

export const PriorityBars = ({ priority }: { priority: Priority | null }) => (
  <span aria-hidden className="flex h-2.5 items-end gap-px">
    {HEIGHTS.map((h, i) => (
      <span
        key={h}
        className={cn(
          "w-[3px] rounded-[0.7px]",
          h,
          priority && i < FILLED[priority] ? COLOR[priority] : "bg-gousse-border",
        )}
      />
    ))}
  </span>
);
