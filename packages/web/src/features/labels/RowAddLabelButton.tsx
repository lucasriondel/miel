import { useRef } from "react";
import { Tag } from "lucide-react";
import { iconButtonClass, iconButtonIconClass } from "../../components/iconButton";
import { rowLabelKey, useRowLabelPicker } from "./rowLabelPickerContext";

interface Props {
  accountId: string;
  gmailMessageId: string;
  /** The row's own labels, marked as added when the panel opens on it. */
  appliedLabelIds: readonly string[];
}

/**
 * The row's face of the list's label picker (#170).
 *
 * All it owns is the trigger — which message the panel is for, and the element
 * it hangs off. The panel, the filter field, the offered labels and the
 * mutation are `RowLabelPickerHost`'s, so the row carries a button and not a
 * popover.
 *
 * It renders nothing where no host is mounted above it. A row outside a list
 * has nowhere to put a panel, and answering that by mounting one here would be
 * the per-row popover the host exists to avoid.
 */
export const RowAddLabelButton = ({ accountId, gmailMessageId, appliedLabelIds }: Props) => {
  const picker = useRowLabelPicker();
  const ref = useRef<HTMLButtonElement>(null);

  if (!picker) return null;

  const open = picker.openRow === rowLabelKey({ accountId, gmailMessageId });

  return (
    <button
      ref={ref}
      type="button"
      aria-label="Add label"
      title="Add label"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => {
        const anchor = ref.current;
        if (anchor) picker.toggle({ accountId, gmailMessageId, appliedLabelIds }, anchor);
      }}
      // The row's size, fixed rather than taken from the variant: the detail
      // bar has its own trigger, in the header beside the badges it adds to, so
      // this one is only ever drawn in a row's strip.
      className={iconButtonClass({ size: "sm" })}
    >
      <Tag className={iconButtonIconClass("sm")} aria-hidden />
    </button>
  );
};
