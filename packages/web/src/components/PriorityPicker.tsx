import { Check, ChevronDown } from "lucide-react";
import type { Priority } from "../api/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PriorityBars } from "./PriorityBars";

const PRIORITIES: Priority[] = ["high", "medium", "low"];
const NAMES: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };

interface Props {
  priority: Priority | null;
  onSelect: (priority: Priority) => void;
}

/**
 * Re-triage by hand (UI System › Priority Picker): the level's bars and name
 * with a caret, opening the three levels with a check on the current one. A
 * message nobody has triaged yet reads "Priority".
 */
export const PriorityPicker = ({ priority, onSelect }: Props) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <button
          type="button"
          aria-label="Change priority"
          title="Change priority"
          className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-gousse-ink transition-colors duration-150 hover:bg-gousse-fill"
        >
          <PriorityBars priority={priority} />
          {priority ? NAMES[priority] : "Priority"}
          <ChevronDown className="h-3.5 w-3.5 text-gousse-muted" aria-hidden />
        </button>
      }
    />
    <DropdownMenuContent align="end" className="min-w-[8.5rem]">
      {PRIORITIES.map((p) => (
        <DropdownMenuItem key={p} onClick={() => onSelect(p)} className="gap-2 text-xs">
          <PriorityBars priority={p} />
          <span className="flex-1 font-medium">{NAMES[p]}</span>
          {priority === p ? (
            <Check className="h-3.5 w-3.5 text-gousse-primary" aria-hidden />
          ) : null}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);
