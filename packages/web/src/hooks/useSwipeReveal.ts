import { useCallback, useRef, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";

interface Options {
  /** Horizontal distance (px) a leftward swipe must reach to lock revealed. */
  threshold?: number;
  /** Ratio |dx|/|dy| above which the gesture counts as horizontal, not scroll. */
  directionRatio?: number;
  enabled?: boolean;
}

interface SwipeReveal {
  revealed: boolean;
  close: () => void;
  handlers: {
    onTouchStart: (e: ReactTouchEvent) => void;
    onTouchMove: (e: ReactTouchEvent) => void;
    onTouchEnd: () => void;
  };
}

/**
 * Reveal-on-swipe-left for a list row. Distinguishes a horizontal swipe from a
 * vertical scroll (via `directionRatio`) so the page still scrolls normally, and
 * only latches `revealed` once a leftward swipe passes `threshold`. Swiping back
 * right (or calling `close`) hides it again. When `enabled` is false the handlers
 * are inert — desktop keeps its hover-reveal untouched.
 */
export function useSwipeReveal({
  threshold = 56,
  directionRatio = 1.4,
  enabled = true,
}: Options = {}): SwipeReveal {
  const [revealed, setRevealed] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"undecided" | "horizontal" | "vertical">("undecided");

  const onTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      if (!enabled) return;
      const t = e.touches[0];
      if (!t) return;
      start.current = { x: t.clientX, y: t.clientY };
      axis.current = "undecided";
    },
    [enabled],
  );

  const onTouchMove = useCallback(
    (e: ReactTouchEvent) => {
      if (!enabled || !start.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;

      if (axis.current === "undecided") {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis.current = Math.abs(dx) > Math.abs(dy) * directionRatio ? "horizontal" : "vertical";
      }
      if (axis.current !== "horizontal") return;

      if (dx <= -threshold) setRevealed(true);
      else if (dx >= threshold) setRevealed(false);
    },
    [enabled, threshold, directionRatio],
  );

  const onTouchEnd = useCallback(() => {
    start.current = null;
    axis.current = "undecided";
  }, []);

  const close = useCallback(() => setRevealed(false), []);

  return { revealed, close, handlers: { onTouchStart, onTouchMove, onTouchEnd } };
}
