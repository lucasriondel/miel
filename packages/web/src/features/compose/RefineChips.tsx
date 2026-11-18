const REFINEMENTS = ["Shorter", "Warmer", "More formal", "In French"];

interface Props {
  onRefine: (refinement: string) => void;
  onAddDetail: () => void;
  disabled: boolean;
}

/**
 * Under a drafted strip: one-press refinements. Each is a new instruction
 * appended to the one the draft came from, then a fresh draft — the server
 * redrafts from the message, it does not edit the previous answer.
 */
export const RefineChips = ({ onRefine, onAddDetail, disabled }: Props) => (
  <div className="flex shrink-0 flex-wrap gap-1.5 px-4 pb-3">
    {REFINEMENTS.map((refinement) => (
      <button
        key={refinement}
        type="button"
        disabled={disabled}
        onClick={() => onRefine(refinement)}
        className="h-7 rounded-full border border-gousse-tint-amber bg-gousse-panel px-2.5 text-xs font-medium text-gousse-tint-amber-ink transition-[background-color,transform] hover:bg-gousse-medium-bg active:scale-[0.96] disabled:opacity-50"
      >
        {refinement}
      </button>
    ))}
    <button
      type="button"
      disabled={disabled}
      onClick={onAddDetail}
      className="h-7 rounded-full border border-dashed border-gousse-tint-amber px-2.5 text-xs font-medium text-gousse-tint-amber-ink/70 hover:text-gousse-tint-amber-ink disabled:opacity-50"
    >
      + Add a detail…
    </button>
  </div>
);
