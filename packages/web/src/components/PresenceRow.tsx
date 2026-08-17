import type { ReactNode } from "react";
import type { PresenceState } from "../hooks/presence";

interface Props {
  state: PresenceState;
  index: number;
  children: ReactNode;
}

// Cap total stagger so long inboxes don't wait seconds for the last row.
const STAGGER_MS = 40;
const MAX_DELAY_MS = 600;

export const PresenceRow = ({ state, index, children }: Props) => {
  const leaving = state === "leaving";

  // Outer grid collapses the row's space (1fr → 0fr) so neighbours close the gap
  // as the inner content slides + fades out. The node persists across the
  // present→leaving flip (same key in usePresence), so the browser sees the
  // value change and transitions it. Keeping the collapse here — off the GPU
  // keyframe — lets `slide-out` animate only opacity/transform. Duration matches
  // usePresence's exitMs (250ms) so the space is gone by unmount.
  return (
    <div
      className={
        leaving
          ? "grid grid-rows-[0fr] transition-[grid-template-rows] duration-[250ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
          : "grid grid-rows-[1fr]"
      }
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={
            leaving
              ? "pointer-events-none border-b border-gousse-line last:border-b-0 motion-safe:animate-slide-out"
              : "border-b border-gousse-line last:border-b-0 motion-safe:animate-slide-up"
          }
          style={
            state === "present"
              ? { animationDelay: `${Math.min(index * STAGGER_MS, MAX_DELAY_MS)}ms` }
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
};
