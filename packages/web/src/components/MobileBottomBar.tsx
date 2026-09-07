import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/**
 * Fixed bottom bar for thumb-reachable controls (Select + Week/All). Hidden
 * from `md:` up, where the top bar has the width to centre the period nav
 * between the account switcher and the sync actions; below that the bar is a
 * single fixed-height row and the three would overlap.
 * Mirrors the TopBar's translucent shell + blur, anchored to the safe-area
 * bottom so iOS home-indicator overlap stays clear.
 */
export const MobileBottomBar = ({ children }: Props) => (
  <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center md:hidden">
    <div className="pointer-events-none absolute inset-0 -z-10 border-t border-gousse-line/60 bg-gousse-panel/80 backdrop-blur-[14px] backdrop-saturate-150" />
    {/* Safe centring + horizontal scroll: on a narrow phone the period nav
        plus the select button can outgrow the row, and plain `justify-center`
        would clip both ends with no way to reach them. */}
    <div className="pointer-events-auto flex w-full items-center justify-center-safe gap-2 overflow-x-auto px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] [scrollbar-width:none]">
      {children}
    </div>
  </div>
);
