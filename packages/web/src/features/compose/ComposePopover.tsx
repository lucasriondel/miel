import { type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useAnchoredPosition } from "../../hooks/useAnchoredPosition";

interface Props {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  align?: "left" | "right";
  /** Escape closes the panel and nothing else — the window under it stays open. */
  onEscape: () => void;
  className?: string;
  id?: string;
  children: ReactNode;
}

/**
 * A panel a compose window opens over itself: the From menu, the address
 * suggestions, the schedule picker.
 *
 * Its own primitive rather than `PopoverPanel` for two reasons. The window
 * clips (it scrolls its fields and rounds its corners), so the panel is
 * portalled out and fixed to its anchor; and the dock sits at `z-[80]`, above
 * the app's popovers, so this one sits above the dock. Escape is caught here
 * and marked handled, because a window takes Escape to mean "minimize" and the
 * person pressing it meant only the panel.
 */
export const ComposePopover = ({
  open,
  anchorRef,
  panelRef,
  align = "left",
  onEscape,
  className,
  id,
  children,
}: Props) => {
  const pos = useAnchoredPosition(anchorRef, open, { align, panelRef, gap: 4 });
  if (!open || !pos) return null;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    onEscape();
  };
  return createPortal(
    // Escape is the only key handled here; the controls inside own the rest.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- see above
    <div
      ref={panelRef}
      id={id}
      onKeyDown={onKeyDown}
      style={{ position: "fixed", top: pos.top, left: pos.left, right: pos.right }}
      className={cn(
        "z-[85] rounded-xl border border-gousse-line bg-gousse-panel p-1.5 shadow-gousse-xl",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
};
