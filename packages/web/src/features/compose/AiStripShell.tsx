import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AiStripTone = "neutral" | "honey" | "error";

const TONE: Record<AiStripTone, string> = {
  neutral:
    "border-gousse-line bg-gousse-hover focus-within:border-gousse-medium focus-within:bg-gousse-panel focus-within:ring-[3px] focus-within:ring-gousse-medium/20",
  honey: "border-gousse-tint-amber bg-gousse-medium-bg text-gousse-tint-amber-ink",
  error: "border-gousse-high-border bg-gousse-high-bg text-gousse-high-text",
};

/**
 * The instruction strip's band: a 40px rounded field above the footer, never a
 * card of its own. Neutral while it waits for an instruction, honey once the AI
 * is involved (drafting, drafted, asking), red when a draft failed.
 */
export const AiStripShell = ({ tone, children }: { tone: AiStripTone; children: ReactNode }) => (
  <div className="shrink-0 px-4 pb-3">
    <div
      className={cn(
        "flex h-10 items-center gap-2 rounded-xl border pr-1.5 pl-3 text-[13px] transition-[background-color,border-color,box-shadow] [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0",
        TONE[tone],
      )}
    >
      {children}
    </div>
  </div>
);
