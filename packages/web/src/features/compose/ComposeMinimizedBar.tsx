import type { ReactNode } from "react";
import { ChevronUp, X } from "lucide-react";
import { ComposeTitleBarButton } from "./ComposeTitleBarButton";

interface Props {
  title: string;
  label?: string;
  status?: ReactNode;
  onRestore: () => void;
  onClose: () => void;
  closeLabel?: string;
}

/**
 * A minimized window: its title bar alone, sitting on the bottom edge. The
 * title restores it as well as the chevron does — the bar is the window's
 * handle — and the lead glyph says whether anything in it is unsent.
 */
export const ComposeMinimizedBar = ({
  title,
  label,
  status,
  onRestore,
  onClose,
  closeLabel = "Close",
}: Props) => (
  <section
    aria-label={label ?? title}
    className="pointer-events-auto flex h-12 w-[min(300px,calc(100vw-1.5rem))] shrink-0 items-center gap-2 rounded-t-[14px] border border-b-0 border-gousse-line bg-gousse-panel pr-2 pl-4 shadow-gousse-lg"
  >
    {status}
    <button
      type="button"
      onClick={onRestore}
      className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-gousse-ink"
      title={title}
    >
      {title}
    </button>
    <ComposeTitleBarButton label="Restore" onClick={onRestore}>
      <ChevronUp aria-hidden />
    </ComposeTitleBarButton>
    <ComposeTitleBarButton label={closeLabel} onClick={onClose}>
      <X aria-hidden />
    </ComposeTitleBarButton>
  </section>
);
