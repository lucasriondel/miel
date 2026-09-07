import type { ReactNode } from "react";

interface Props {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /**
   * Trashing the mail is the only irreversible thing on a row, so it is the
   * only icon that colours on hover. Dismiss sits beside it and stays neutral —
   * losing a suggestion costs nothing.
   */
  danger?: boolean;
  children: ReactNode;
}

/**
 * One act on a ledger row. Icon only, with the label carried by `aria-label`
 * and `title`: five kinds of row share one column, and words in it would make
 * the column as wide as its longest verb on every row that has none.
 */
export const LedgerIconButton = ({ label, onClick, disabled, danger, children }: Props) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gousse-muted transition-[background-color,color,transform] active:scale-[0.92] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gousse-muted ${
      danger
        ? "hover:bg-gousse-high/[0.14] hover:text-gousse-high"
        : "hover:bg-gousse-ink/[0.08] hover:text-gousse-ink"
    }`}
  >
    {children}
  </button>
);
