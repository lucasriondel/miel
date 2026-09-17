import { Plus } from "lucide-react";
import { badgeClasses } from "@/components/ui/badge";
import { useAddMessageLabel } from "../../api/mutations";
import type { Label, MessageDetail } from "../../api/types";
import { LabelPicker } from "../labels/LabelPicker";
import { toMessageLabel } from "../labels/toMessageLabel";

interface Props {
  message: MessageDetail;
}

/**
 * Putting one of the account's labels on the message being read (#167).
 *
 * The gap this fills is the one a bare message leaves: a label could be taken
 * off one message, put on many at once from the bulk bar, or accepted from a
 * triage suggestion — so a message with no run, or one whose suggestions were
 * all settled, could not be labelled without going back to the list.
 *
 * It therefore sits in the header's badge row *unconditionally*, and the row is
 * drawn whether or not there is a badge beside it. A trigger that appeared only
 * next to an existing label would be missing from exactly the message someone
 * opened in order to label.
 *
 * Only the trigger is this component's: the popover, the panel, the filter field
 * and the offered labels are `LabelPicker`'s, shared with the bulk bar (#169).
 */
export const AddLabelButton = ({ message }: Props) => {
  const addLabel = useAddMessageLabel();

  // What the message already carries, so the menu can mark it. The badge is
  // written optimistically, so this set is current from the click onwards and
  // the label just added reads as added the next time the menu opens.
  const applied = new Set(message.labels.map((l) => l.id));

  const pick = (label: Label) => {
    addLabel.mutate({
      accountId: message.accountId,
      gmailMessageId: message.gmailMessageId,
      label: toMessageLabel(label),
    });
  };

  return (
    <LabelPicker
      accountId={message.accountId}
      applied={applied}
      onPick={pick}
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          aria-label="Add label"
          title="Add a label to this message"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggle}
          className={badgeClasses(
            { variant: "suggested", interactive: true },
            "hover:border-solid hover:bg-gousse-line/40 hover:text-gousse-ink",
          )}
        >
          <Plus className="h-3 w-3" aria-hidden />
          Add label
        </button>
      )}
    />
  );
};
