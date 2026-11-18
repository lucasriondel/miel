interface Props {
  enabled: boolean;
  onToggle: () => void;
}

/**
 * Opt-in for the remote images the HTML body references, for this one message.
 * Rendered only under the hide-by-default preference (#149) — when images load
 * by default the header has nothing to ask. A pill rather than the
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
    className="h-7 rounded-lg border border-gousse-border bg-gousse-panel px-2.5 text-xs font-semibold text-gousse-ink transition-colors hover:border-gousse-border-strong hover:bg-gousse-hover"
  >
    {enabled ? "Hide remote images" : "Show remote images"}
  </button>
);
