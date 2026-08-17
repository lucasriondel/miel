interface Props {
  enabled: boolean;
  onToggle: () => void;
}

/**
 * Opt-in for the remote images the HTML body references. A pill rather than the
 * old `rounded-lg` chip (DESIGN.md §3), pressed-state exposed with
 * `aria-pressed` since the control toggles rather than navigates.
 *
 * Sized off the segmented control it sits beside — same `text-xs` and vertical
 * padding — so the two read as one row of controls.
 */
export const RemoteImagesToggle = ({ enabled, onToggle }: Props) => (
  <button
    type="button"
    aria-pressed={enabled}
    onClick={onToggle}
    className="rounded-full border border-gousse-line/60 bg-gousse-panel px-3.5 py-1.5 text-xs font-bold text-gousse-muted shadow-gousse-sm transition-[background-color,color,transform] hover:bg-gousse-line/30 hover:text-gousse-ink active:scale-[0.96]"
  >
    {enabled ? "Hide remote images" : "Show remote images"}
  </button>
);
