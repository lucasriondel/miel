import { PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarRail } from "./SidebarRailContext";

interface Props {
  onCompose: () => void;
}

/**
 * The sidebar's one primary action (UI System › Compose Button): the brand ink
 * filled, 36px tall, with its shortcut `C` shown beside the label. On the rail
 * it is the pencil alone in a 40px tile.
 */
export const ComposeButton = ({ onCompose }: Props) => {
  const rail = useSidebarRail();
  return (
    <button
      type="button"
      onClick={onCompose}
      aria-label="Compose"
      aria-keyshortcuts="C"
      title={rail ? "Compose (C)" : undefined}
      className={cn(
        "flex h-9 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-gousse-primary text-[13px] font-semibold text-gousse-on-primary",
        "transition-colors duration-150 hover:bg-gousse-primary-hover active:bg-gousse-primary-pressed",
        "focus-visible:ring-[3px] focus-visible:ring-gousse-navy/35 focus-visible:outline-none",
        rail ? "w-10" : "w-full",
      )}
    >
      <PenLine className="h-3.5 w-3.5" aria-hidden />
      {rail ? null : (
        <>
          <span>Compose</span>
          <kbd className="font-sans text-[11px] font-medium text-gousse-on-primary/60">C</kbd>
        </>
      )}
    </button>
  );
};
