interface Props {
  /** The literal itself, or null when the row stored none. */
  value: string | null;
}

/** A value the row does not carry, in a column that has to be filled anyway. */
const UNSTATED = "—";

/**
 * One chip shape for every literal a user might copy off a row — a promo code,
 * an OTP, a confirmation code. Dashed border, mono, wide tracking, on the page
 * ground rather than the panel's, so it reads as a thing lifted out of the mail
 * rather than a word in a sentence.
 *
 * Sharing one shape across the kinds is what lets the copy icon in the act
 * column go unlabelled: whatever is in a dashed chip is the thing that copies.
 *
 * A row with no value keeps the chip and holds a dash. Vanishing would leave
 * the value column empty and the row misaligned against the ones above it; the
 * dash is the same mark every unstated field gets, and deliberately not a
 * sentence — the only promo that reaches it is one written before #166 stopped
 * storing code-less offers, so explaining it as a kind of promo would describe
 * something this no longer produces (#168).
 */
export const LedgerValueChip = ({ value }: Props) =>
  value === null ? (
    <span className="inline-flex shrink-0 items-center rounded-lg border border-gousse-line bg-gousse-bg px-2.5 py-[3px] text-xs font-medium text-gousse-muted">
      {UNSTATED}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-lg border border-dashed border-gousse-line bg-gousse-bg px-2.5 py-[3px] font-mono text-[13px] font-bold tracking-[0.16em] tabular-nums text-gousse-ink">
      {value}
    </span>
  );
