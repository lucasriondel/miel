import { createContext, useContext } from "react";

/** The message a row asks the list's one picker to label. */
export interface RowLabelTarget {
  accountId: string;
  gmailMessageId: string;
  /** What the row already carries, so the picker can mark those as added. */
  appliedLabelIds: readonly string[];
}

export interface RowLabelPickerControl {
  /** Which row the one panel is open on, as {@link rowLabelKey}, or null. */
  openRow: string | null;
  /** Show the panel on this row, or take it away if it is already there. */
  toggle: (target: RowLabelTarget, anchor: HTMLElement) => void;
}

/** One row, named the same way by the host and by the trigger that asks. */
export const rowLabelKey = (row: { accountId: string; gmailMessageId: string }): string =>
  `${row.accountId}|${row.gmailMessageId}`;

/**
 * The list's label picker, as a row reaches it (#170).
 *
 * A row does not mount a picker: fifty rows would be fifty popovers and fifty
 * reads of the same account's labels, so the list mounts one
 * `RowLabelPickerHost` and a row's trigger only says which message it is aimed
 * at and what to hang the panel off.
 *
 * `undefined` — no host above — is a real answer rather than an oversight, and
 * the trigger renders nothing for it: a row mounted outside a list has nowhere
 * to put a panel, and the alternative (falling back to a picker of its own) is
 * precisely the per-row popover this exists to avoid.
 */
export const RowLabelPickerContext = createContext<RowLabelPickerControl | undefined>(undefined);

export const useRowLabelPicker = (): RowLabelPickerControl | undefined =>
  useContext(RowLabelPickerContext);
