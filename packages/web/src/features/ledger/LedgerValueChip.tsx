interface Props {
  /** The literal itself, or null when the row stored none. */
  value: string | null;
}

/** A value the row does not carry, in a column that has to be filled anyway. */
const UNSTATED = "—";

/**
 * One chip shape for every literal a user might copy off a row — an OTP, a
 * confirmation code. Dashed border, mono, wide tracking, on the page
 * ground rather than the panel's, so it reads as a thing lifted out of the mail
 * rather than a word in a sentence.
 *
 * Sharing one shape across the kinds is what lets the copy icon in the act
 * column go unlabelled: whatever is in a dashed chip is the thing that copies.
 *
 * A row with no value keeps the chip and holds a dash. Vanishing would leave
 * the value column empty and the row misaligned against the ones above it; the
 * dash is the same mark every unstated field gets, and deliberately not a
 * sentence (#168).
 */
export const LedgerValueChip = ({ value }: Props) =>
  value === null ? (
    <span className="inline-flex shrink-0 items-center h-6 rounded-md border border-gousse-line bg-gousse-panel px-2 text-xs font-medium text-gousse-muted">
      {UNSTATED}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center h-6 rounded-md border border-gousse-border bg-gousse-hover px-2 font-mono text-xs font-semibold tracking-[0.12em] tabular-nums text-gousse-ink">
      {value}
    </span>
  );
