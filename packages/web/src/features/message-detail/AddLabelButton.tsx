import { Plus } from "lucide-react";
import { badgeClasses } from "@/components/ui/badge";
import { useAddMessageLabel } from "../../api/mutations";
import type { Label, MessageDetail } from "../../api/types";
import { usePopover } from "../../hooks/usePopover";
import { LabelPickerMenu } from "../labels/LabelPickerMenu";

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
 * Click-to-open rather than hover, so a finger reaches it as readily as a
 * pointer; click-outside and Escape close it, which is `usePopover`'s business.
 * The panel is anchored in place rather than portalled — the header is inside
 * the page's one scroll region and is not clipped, so it has nothing to escape.
 */
export const AddLabelButton = ({ message }: Props) => {
  const popover = usePopover<HTMLDivElement>();
  const addLabel = useAddMessageLabel();

  // What the message already carries, so the menu can mark it. The badge is
  // written optimistically, so this set is current from the click onwards and
  // the label just added reads as added the next time the menu opens.
  const applied = new Set(message.labels.map((l) => l.id));

  const pick = (label: Label) => {
    popover.close();
    addLabel.mutate({
      accountId: message.accountId,
      gmailMessageId: message.gmailMessageId,
      label: {
        id: label.id,
        name: label.name,
        gmailLabelId: label.gmailLabelId,
        colorBg: label.colorBg,
        colorFg: label.colorFg,
      },
    });
  };

  return (
    <div ref={popover.ref} className="relative">
      <button
        type="button"
        aria-label="Add label"
        title="Add a label to this message"
        aria-haspopup="menu"
        aria-expanded={popover.open}
        onClick={popover.toggle}
        className={badgeClasses(
          { variant: "suggested", interactive: true },
          "hover:border-solid hover:bg-gousse-line/40 hover:text-gousse-ink",
        )}
      >
        <Plus className="h-3 w-3" aria-hidden />
        Add label
      </button>
      {popover.open ? (
        <div
          role="menu"
          aria-label="Labels"
          className="absolute left-0 top-full z-[60] mt-1.5 flex max-h-64 w-56 max-w-[calc(100vw-2rem)] flex-col gap-0.5 overflow-y-auto rounded-xl border border-gousse-line bg-gousse-panel p-1.5 shadow-gousse-lg"
        >
          <LabelPickerMenu accountId={message.accountId} applied={applied} onPick={pick} />
        </div>
      ) : null}
    </div>
  );
};
