import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface Props {
  title: string;
  count: number;
  /** The heading's colour: amber for what is waiting, muted for what lapsed. */
  tone?: "review" | "default" | "muted";
  /** A control at the right edge that acts on the whole section. */
  action?: ReactNode;
}

const TONE = {
  review: "text-gousse-tint-amber-ink",
  default: "text-gousse-ink",
  muted: "text-gousse-muted",
} as const;

/** A section's heading row — title, count and an optional trailing control. */
export const PromoSectionHeader = ({ title, count, tone = "default", action }: Props) => (
  <div className="flex min-h-6 items-center gap-2 px-4">
    <h2 className={cn("text-sm font-semibold", TONE[tone])}>{title}</h2>
    <span className="text-[11px] font-medium text-gousse-muted">{count}</span>
    {action ? <div className="ml-auto flex items-center">{action}</div> : null}
  </div>
);
