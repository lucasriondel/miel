import type { ReactNode } from "react";
import type { PresenceState } from "../hooks/presence";

interface Props {
  state: PresenceState;
  children: ReactNode;
}

/**
 * A category group's exit, `PresenceRow`'s technique one level up: the outer
 * grid collapses its track (1fr → 0fr) so the groups below close the gap while
 * the inner content slides and fades out. Without it a group whose last row
 * left — every group of the account being switched away from — kept its
 * heading at full height until the rows unmounted, then vanished in one frame.
 *
 * The node is the same across the present→leaving flip (the group's key is
 * unchanged), so the browser transitions the track rather than jumping it. A
 * leaving group is `inert`: its heading's actions would act on rows that are
 * already on their way out, from an account that may no longer be shown.
 *
 * The separator lives here rather than on the group so `last:` still sees the
 * groups as siblings.
 */
export const PresenceGroup = ({ state, children }: Props) => {
  const leaving = state === "leaving";
  return (
    <div
      inert={leaving || undefined}
      className={
        leaving
          ? "grid grid-rows-[0fr] border-b border-gousse-line transition-[grid-template-rows] duration-[250ms] ease-[cubic-bezier(0.2,0,0,1)] last:border-b-0 motion-reduce:transition-none"
          : "grid grid-rows-[1fr] border-b border-gousse-line last:border-b-0"
      }
    >
      <div className="min-h-0 overflow-hidden">
        <div className={leaving ? "pointer-events-none motion-safe:animate-slide-out" : undefined}>
          {children}
        </div>
      </div>
    </div>
  );
};
