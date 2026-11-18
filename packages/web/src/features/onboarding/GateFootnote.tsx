import type { ReactNode } from "react";

/** The hairline and the one quiet line under a centred step. */
export const GateFootnote = ({ children }: { children: ReactNode }) => (
  <div className="mt-5 w-full border-t border-gousse-line pt-3.5 text-center text-xs leading-[18px] text-gousse-muted">
    {children}
  </div>
);
