import type { ReactNode, RefObject } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPosition } from "../hooks/useAnchoredPosition";

interface Props {
  open: boolean;
  /** Trigger element the panel is anchored under. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Attach to the rendered panel — used for click-outside and clamping. */
  panelRef: RefObject<HTMLElement | null>;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}

/**
 * Floating panel anchored under a popover trigger. Portalled to `document.body`
 * and fixed-positioned via {@link useAnchoredPosition} so it escapes any
 * ancestor `overflow-hidden`/stacking context (message rows clip and stack, so
 * an in-flow `absolute` panel rendered behind the next row). The position is
 * clamped to the viewport, matching the other portalled popovers.
 *
 * Animates in via opacity + scale, honouring prefers-reduced-motion. Stays
 * mounted for one frame after `open` flips so the enter transition runs.
 */
export const PopoverPanel = ({
  open,
  anchorRef,
  panelRef,
  align = "left",
  className = "",
  children,
}: Props) => {
  const pos = useAnchoredPosition(anchorRef, open, { align, panelRef });
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!pos) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [pos]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={panelRef as RefObject<HTMLDivElement>}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        right: pos.right,
      }}
      className={`z-[70] w-[min(15rem,calc(100vw-2rem))] rounded-2xl border border-gousse-line bg-gousse-panel p-2 shadow-gousse-xl transition-[opacity,transform] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] ${
        align === "right" ? "origin-top-right" : "origin-top-left"
      } ${
        entered
          ? "translate-y-0 scale-100 opacity-100"
          : "-translate-y-1.5 scale-95 opacity-0 motion-reduce:translate-y-0 motion-reduce:scale-100"
      } ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
};

export const PopoverTitle = ({ children }: { children: ReactNode }) => (
  <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-gousse-muted">
    {children}
  </div>
);
