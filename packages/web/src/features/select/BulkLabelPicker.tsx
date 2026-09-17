import { Tag } from "lucide-react";
import type { Label } from "../../api/types";
import { iconButtonClass, iconButtonIconClass } from "../../components/iconButton";
import { LabelPicker } from "../labels/LabelPicker";

interface Props {
  accountId: string;
  disabled?: boolean;
  onPick: (label: Label) => void;
}

/**
 * The bulk bar's face of the label picker (#147): the account's own labels, one
 * click away from the selection.
 *
 * All this owns is the trigger and the edge the panel hangs from; the popover,
 * the filter field and which labels are in it are `LabelPicker`'s, shared with
 * the message detail's "Add label" (#169). Nothing is marked as applied here: a
 * selection is many messages, which carry different labels and share no answer
 * to it.
 */
export const BulkLabelPicker = ({ accountId, disabled, onPick }: Props) => (
  <LabelPicker
    accountId={accountId}
    align="right"
    onPick={onPick}
    renderTrigger={({ open, toggle }) => (
      <button
        type="button"
        aria-label="Apply label"
        title="Apply label"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        disabled={disabled}
        className={`${iconButtonClass()} w-auto gap-1.5 px-2.5 text-sm font-medium`}
      >
        <Tag className={iconButtonIconClass()} aria-hidden />
        <span className="hidden sm:inline">Label</span>
      </button>
    )}
  />
);
