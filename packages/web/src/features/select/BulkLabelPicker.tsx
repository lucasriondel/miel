import { Tag } from "lucide-react";
import { usePopover } from "../../hooks/usePopover";
import type { Label } from "../../api/types";
import { iconButtonClass, iconButtonIconClass } from "../../components/iconButton";
import { LabelPickerMenu } from "../labels/LabelPickerMenu";

interface Props {
  accountId: string;
  disabled?: boolean;
  onPick: (label: Label) => void;
}

/**
 * The bulk bar's label chooser (#147): the account's own labels, one click
 * away from the selection.
 *
 * Click-to-open rather than hover-to-open, so a finger reaches it as readily as
 * a pointer, and click-outside/Escape close it — `usePopover`'s business, the
 * same as the row's "Filter similar". The panel is anchored inside the bar
 * rather than portalled: the bar is `sticky`, not clipped, so it has nothing to
 * escape from.
 *
 * Which labels are in it is `LabelPickerMenu`'s business, shared with the
 * message detail's "Add label" (#167) — only the trigger and where the panel
 * hangs are this component's. Nothing is marked as applied here: a selection is
 * many messages, which carry different labels and share no answer to it.
 */
export const BulkLabelPicker = ({ accountId, disabled, onPick }: Props) => {
  const popover = usePopover<HTMLDivElement>();

  const pick = (label: Label) => {
    popover.close();
    onPick(label);
  };

  return (
    <div ref={popover.ref} className="relative">
      <button
        type="button"
        aria-label="Apply label"
        title="Apply label"
        aria-haspopup="menu"
        aria-expanded={popover.open}
        onClick={popover.toggle}
        disabled={disabled}
        className={`${iconButtonClass()} w-auto gap-1.5 px-2.5 text-sm font-medium`}
      >
        <Tag className={iconButtonIconClass()} aria-hidden />
        <span className="hidden sm:inline">Label</span>
      </button>
      {popover.open ? (
        <div
          role="menu"
          aria-label="Labels"
          className="absolute right-0 top-full z-[60] mt-1.5 flex max-h-64 w-56 max-w-[calc(100vw-2rem)] flex-col gap-0.5 overflow-y-auto rounded-xl border border-gousse-line bg-gousse-panel p-1.5 shadow-gousse-lg"
        >
          <LabelPickerMenu accountId={accountId} onPick={pick} />
        </div>
      ) : null}
    </div>
  );
};
