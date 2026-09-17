import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Label } from "../../api/types";
import { useAnchoredPosition } from "../../hooks/useAnchoredPosition";
import { LabelPickerMenu } from "./LabelPickerMenu";
import { labelPanelClass } from "./labelPanel";

interface Props {
  accountId: string;
  /** The trigger it hangs off — a button inside a row, not a wrapper of its own. */
  anchor: HTMLElement;
  applied: ReadonlySet<string>;
  onPick: (label: Label) => void;
  onClose: () => void;
}

/**
 * The one panel the inbox list keeps for labelling a row (#170).
 *
 * It is `LabelPicker`'s panel with the two halves swapped round: there the
 * popover wraps its trigger and the panel is absolutely positioned inside that
 * wrapper, which is exactly what a list cannot do — the wrapper would be per
 * row. So the panel is portalled to the body and fixed-positioned against
 * whichever trigger asked, the way `FilterSimilarPopover` escapes the same
 * clipping, and `useAnchoredPosition` keeps it there through a scroll and off
 * the viewport's edges on a narrow screen. What is inside it is
 * `LabelPickerMenu` — the same filter field, the same list, the same four
 * answers — so the row's picker and the other two are one picker.
 *
 * Mounted only while a row is open, and keyed by that row, so each open starts
 * from a fresh position and an unfiltered list.
 *
 * Closing on an outside press and on Escape is written here rather than taken
 * from `usePopover`, because the open state is the host's — a row's trigger has
 * to know whether the panel is on it, and two places holding that answer is how
 * they disagree.
 */
export const RowLabelPickerPanel = ({ accountId, anchor, applied, onPick, onClose }: Props) => {
  const anchorRef = useRef<HTMLElement | null>(anchor);
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = useAnchoredPosition(anchorRef, true, { align: "right", panelRef });

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // The trigger is not "outside": pressing it again is a toggle, which is
      // the host's to run, and closing here first would make it re-open.
      if (panelRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchor, onClose]);

  // One frame with no position rather than one in the wrong place: the panel is
  // measured and clamped before it paints, as `FilterSimilarPopover` is.
  if (!pos) return null;

  return createPortal(
    <div
      ref={panelRef as RefObject<HTMLDivElement>}
      style={{ position: "fixed", top: pos.top, right: pos.right }}
      className={`z-[70] ${labelPanelClass}`}
    >
      <LabelPickerMenu accountId={accountId} applied={applied} onPick={onPick} />
    </div>,
    document.body,
  );
};
