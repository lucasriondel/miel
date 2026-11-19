import type { ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ComposeTitleBarButton } from "./ComposeTitleBarButton";

interface Props {
  title: string;
  onMinimize: () => void;
  onClose: () => void;
  closeLabel?: string;
  /** What leads the bar before the title: a reply's mode chip. */
  leading?: ReactNode;
}

/**
 * The open window's handle: what is being written, and the two ways to get it
 * out of the way. Minimize keeps the draft, close discards it — so they are two
 * controls and never one toggle.
 */
export const ComposeTitleBar = ({
  title,
  onMinimize,
  onClose,
  closeLabel = "Close",
  leading,
}: Props) => (
  <div
    className={cn(
      "flex h-12 shrink-0 items-center gap-0.5 border-b border-gousse-line bg-gousse-hover pr-2",
      leading ? "pl-3" : "pl-5",
    )}
  >
    {leading}
    <p className="flex-1 truncate text-[13px] font-semibold text-gousse-ink" title={title}>
      {title}
    </p>
    <ComposeTitleBarButton label="Minimize" onClick={onMinimize}>
      <ChevronDown aria-hidden />
    </ComposeTitleBarButton>
    <ComposeTitleBarButton label={closeLabel} onClick={onClose}>
      <X aria-hidden />
    </ComposeTitleBarButton>
  </div>
);
