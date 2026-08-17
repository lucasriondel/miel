import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/**
 * Mobile-only fixed bottom bar for thumb-reachable controls (Select + Week/All).
 * Hidden on `sm:` and up — desktop renders these inside the TopBar instead.
 * Mirrors the TopBar's translucent shell + blur, anchored to the safe-area
 * bottom so iOS home-indicator overlap stays clear.
 */
export const MobileBottomBar = ({ children }: Props) => (
  <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center sm:hidden">
    <div className="pointer-events-none absolute inset-0 -z-10 border-t border-gousse-line/60 bg-gousse-panel/80 backdrop-blur-[14px] backdrop-saturate-150" />
    <div className="pointer-events-auto flex w-full items-center justify-center gap-2 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  </div>
);
