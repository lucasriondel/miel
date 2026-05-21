import type { ReactNode } from "react";

interface Props {
  left: ReactNode;
  right: ReactNode;
}

export const TopBar = ({ left, right }: Props) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-miel-line bg-miel-panel px-6 py-3">
    {left}
    <div className="flex items-center gap-2">{right}</div>
  </div>
);
