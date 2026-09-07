interface Props {
  /** The literal itself, or null for an offer that needs no code. */
  value: string | null;
  /** What to say instead when there is no value — "No code needed". */
  emptyLabel?: string;
}

/**
 * One chip shape for every literal a user might copy off a row — a promo code,
 * an OTP, a confirmation code. Dashed border, mono, wide tracking, on the page
 * ground rather than the panel's, so it reads as a thing lifted out of the mail
 * rather than a word in a sentence.
 *
 * Sharing one shape across the kinds is what lets the copy icon in the act
 * column go unlabelled: whatever is in a dashed chip is the thing that copies.
 *
 * A promo with no code gets the chip anyway, saying so. Vanishing would leave
 * the row's value column empty and the row misaligned against the ones above
 * it, and "no code needed" is a fact about the offer worth reading.
 */
export const LedgerValueChip = ({ value, emptyLabel = "No code needed" }: Props) =>
  value === null ? (
    <span className="inline-flex shrink-0 items-center rounded-lg border border-gousse-line bg-gousse-bg px-2.5 py-[3px] text-xs font-medium text-gousse-muted">
      {emptyLabel}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-lg border border-dashed border-gousse-line bg-gousse-bg px-2.5 py-[3px] font-mono text-[13px] font-bold tracking-[0.16em] tabular-nums text-gousse-ink">
      {value}
    </span>
  );
