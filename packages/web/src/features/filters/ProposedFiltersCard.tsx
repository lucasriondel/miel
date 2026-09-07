import type { ReactNode } from "react";
import type { Label, SuggestedFilter } from "../../api/types";
import { ProposedFiltersHeader } from "./ProposedFiltersHeader";
import { SuggestedFilterRow } from "./SuggestedFilterRow";

interface Props {
  suggestions: SuggestedFilter[];
  labelsByName: Map<string, Label>;
  /**
   * Optional trailing row rendered inside the card, under a hairline. Kept
   * inside the gradient edge so it never floats loose against the page.
   */
  footer?: ReactNode;
}

/**
 * The "Proposed by AI" group. The card is edged with a static rainbow hairline
 * (`.filter-proposals-card` in `index.css`) — the calm form of the AI cue the
 * Triage pill spins: same spectrum, no motion. Suggestions stack inside with
 * hairline dividers.
 */
export const ProposedFiltersCard = ({ suggestions, labelsByName, footer }: Props) => {
  if (suggestions.length === 0) return null;

  return (
    <div className="filter-proposals-card">
      <div className="rounded-[19px] bg-gousse-panel px-4 py-3.5 sm:px-5">
        <ProposedFiltersHeader count={suggestions.length} />

        <div className="divide-y divide-gousse-line/50">
          {suggestions.map((s) => (
            <SuggestedFilterRow key={s.id} suggestion={s} labelsByName={labelsByName} />
          ))}
        </div>

        {footer ? (
          <div className="mt-1 flex justify-end border-t border-gousse-line/50 pt-2.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
};
