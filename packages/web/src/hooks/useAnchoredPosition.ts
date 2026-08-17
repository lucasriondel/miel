import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

export interface AnchoredPosition {
  top: number;
  /** Set when aligned to the anchor's right edge (measured from viewport right). */
  right?: number;
  /** Set when aligned to the anchor's left edge (measured from viewport left). */
  left?: number;
}

interface Options {
  /**
   * Which anchor edge the panel's matching edge lines up with.
   * "right" (default) matches the original `right-0` layout; "left" matches
   * `left-0`.
   */
  align?: "left" | "right";
  panelRef?: RefObject<HTMLElement | null>;
  gap?: number;
  margin?: number;
}

/**
 * Computes fixed-viewport coordinates for a panel anchored under `anchorRef`, so
 * the panel can be portalled to `document.body` and escape any
 * `overflow-hidden`/stacking context. Recomputes while `enabled` on scroll
 * (capture, to catch nested scrollers) and resize.
 *
 * By default the panel's right edge aligns with the anchor's right edge; pass
 * `align: "left"` to align the left edges instead.
 *
 * When `panelRef` is supplied the result is clamped to keep the whole panel
 * within the viewport (with `margin` px of breathing room). This matters on
 * narrow/mobile viewports where a wide panel anchored near an edge would
 * otherwise overflow the opposite edge and get visually cut off. Because the
 * panel only mounts once a position exists, the first pass is unclamped and the
 * mounted panel is re-measured in a layout effect (pre-paint, so no flicker).
 */
export function useAnchoredPosition(
  anchorRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  options: Options = {},
): AnchoredPosition | null {
  const { align = "right", panelRef, gap = 8, margin = 8 } = options;
  const [pos, setPos] = useState<AnchoredPosition | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      setPos(null);
      return;
    }

    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let top = rect.bottom + gap;
      let right = vw - rect.right;
      let left = rect.left;

      const panel = panelRef?.current;
      if (panel) {
        const { width, height } = panel.getBoundingClientRect();
        // Keep both horizontal edges within [margin, viewport - margin].
        const maxRight = Math.max(vw - width - margin, margin);
        const maxLeft = Math.max(vw - width - margin, margin);
        right = Math.min(Math.max(right, margin), maxRight);
        left = Math.min(Math.max(left, margin), maxLeft);
        // Flip above the anchor if it would overflow the bottom edge.
        if (top + height + margin > vh && rect.top - gap - height >= margin) {
          top = rect.top - gap - height;
        }
        top = Math.min(top, Math.max(vh - height - margin, margin));
      }

      const next: AnchoredPosition = align === "left" ? { top, left } : { top, right };
      setPos((prev) =>
        prev && prev.top === next.top && prev.left === next.left && prev.right === next.right
          ? prev
          : next,
      );
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
    // `pos !== null` re-runs this effect after the panel mounts so its measured
    // size is clamped in — synchronously, pre-paint, so there is no flash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorRef, enabled, align, panelRef, gap, margin, pos !== null]);

  return pos;
}
