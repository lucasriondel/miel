import { ChevronDown, X } from "lucide-react";
import { ComposeTitleBarButton } from "./ComposeTitleBarButton";

interface Props {
  title: string;
  onMinimize: () => void;
  onClose: () => void;
  closeLabel?: string;
}

/**
 * The open window's handle: what is being written, and the two ways to get it
 * out of the way. Minimize keeps the draft, close discards it — so they are two
 * controls and never one toggle.
 */
export const ComposeTitleBar = ({ title, onMinimize, onClose, closeLabel = "Close" }: Props) => (
  <div className="flex h-12 shrink-0 items-center gap-0.5 border-b border-gousse-line bg-gousse-hover pr-2 pl-5">
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
