import { useRemoveMessageLabel } from "../api/mutations";
import type { MessageLabel } from "../api/types";
import { LabelBadge } from "./LabelBadge";
import { SystemLabelBadge, isSystemLabel } from "./SystemLabelBadge";

interface Props {
  accountId: string;
  gmailMessageId: string;
  labels: MessageLabel[];
}

/**
 * The labels a message carries, as the detail page draws them: the full
 * `LabelBadge` with its ✕, since the detail page is where a label is taken off.
 * INBOX and UNREAD are implied by the page rather than drawn.
 */
export const MessageLabels = ({ accountId, gmailMessageId, labels }: Props) => {
  const removeLabel = useRemoveMessageLabel();

  const visible = labels.filter((l) => l.name !== "INBOX" && l.name !== "UNREAD");
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((l) =>
        isSystemLabel(l.name) ? (
          <SystemLabelBadge key={l.id} name={l.name} />
        ) : (
          <LabelBadge
            key={l.id}
            name={l.name}
            colorBg={l.colorBg}
            colorFg={l.colorFg}
            removeDisabled={removeLabel.isPending}
            onRemove={() =>
              removeLabel.mutate({
                accountId,
                gmailMessageId,
                labelId: l.id,
              })
            }
          />
        ),
      )}
    </div>
  );
};
