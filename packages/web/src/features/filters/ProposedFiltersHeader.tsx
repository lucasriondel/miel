import { Sparkles } from "lucide-react";

interface Props {
  count: number;
}

/**
 * Header of the proposals card: an accent chip naming the source, and the
 * waiting count on the far right. The chip carries the "this is AI" cue at
 * badge weight now that the card's edge no longer glows.
 */
export const ProposedFiltersHeader = ({ count }: Props) => (
  <header className="flex items-center gap-2.5 pb-2.5">
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gousse-accent/12 py-1 pl-2 pr-2.5 text-[11px] font-bold tracking-[0.01em] text-gousse-accent">
      <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
      Proposed by AI
    </span>
    <span className="ml-auto text-xs tabular-nums text-gousse-muted">{count} waiting</span>
  </header>
);
