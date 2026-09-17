import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { useAddMessageLabel } from "../../api/mutations";
import type { Label } from "../../api/types";
import {
  RowLabelPickerContext,
  rowLabelKey,
  type RowLabelPickerControl,
  type RowLabelTarget,
} from "./rowLabelPickerContext";
import { RowLabelPickerPanel } from "./RowLabelPickerPanel";
import { toMessageLabel } from "./toMessageLabel";

/**
 * The inbox list's label picker: one panel, one mutation, however many rows
 * (#170).
 *
 * Filing a mail you can identify from its row is the common case, and it used
 * to cost either opening the message or entering select mode — a mode built for
 * acting on many. The row gains the *attach* half of labelling and nothing
 * else: detaching stays the detail page's, where a badge carries its ✕.
 *
 * Mounted by whatever renders the rows, which is why the state lives here
 * rather than in a row. A row holding it would mean a popover, a labels query
 * and an outside-click listener per row, and an account's labels read once per
 * row that was ever asked; here the panel exists only while someone is
 * choosing, and the labels are read once for the list.
 *
 * The mutation is #167's, unchanged: the badge is written to the lists and to
 * the open detail before the server answers, a refusal rolls it back and says
 * so from the mutation itself.
 */
export const RowLabelPickerHost = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState<{ target: RowLabelTarget; anchor: HTMLElement } | null>(null);
  const addLabel = useAddMessageLabel();

  const close = useCallback(() => setOpen(null), []);

  const control = useMemo<RowLabelPickerControl>(
    () => ({
      openRow: open ? rowLabelKey(open.target) : null,
      // Which of the two things a press does is decided against the state it
      // writes, not the state the row last rendered.
      toggle: (target, anchor) =>
        setOpen((current) =>
          current && rowLabelKey(current.target) === rowLabelKey(target)
            ? null
            : { target, anchor },
        ),
    }),
    [open],
  );

  const pick = (label: Label) => {
    if (!open) return;
    const { accountId, gmailMessageId } = open.target;
    // Closed before the request goes, the way the shared picker closes behind a
    // pick: the answer to "which label" has been given.
    setOpen(null);
    addLabel.mutate({ accountId, gmailMessageId, label: toMessageLabel(label) });
  };

  return (
    <RowLabelPickerContext.Provider value={control}>
      {children}
      {open ? (
        <RowLabelPickerPanel
          key={rowLabelKey(open.target)}
          accountId={open.target.accountId}
          anchor={open.anchor}
          applied={new Set(open.target.appliedLabelIds)}
          onPick={pick}
          onClose={close}
        />
      ) : null}
    </RowLabelPickerContext.Provider>
  );
};
