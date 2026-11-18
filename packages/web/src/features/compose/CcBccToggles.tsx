interface Props {
  showCc: boolean;
  showBcc: boolean;
  onShowCc: () => void;
  onShowBcc: () => void;
}

/** "Cc" and "Bcc" at the end of the To row: each unfolds its own row, once. */
export const CcBccToggles = ({ showCc, showBcc, onShowCc, onShowBcc }: Props) => (
  <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-gousse-muted">
    {showCc ? null : (
      <button
        type="button"
        onClick={onShowCc}
        className="hover:text-gousse-ink"
        aria-label="Add Cc"
      >
        Cc
      </button>
    )}
    {showBcc ? null : (
      <button
        type="button"
        onClick={onShowBcc}
        className="hover:text-gousse-ink"
        aria-label="Add Bcc"
      >
        Bcc
      </button>
    )}
  </span>
);
