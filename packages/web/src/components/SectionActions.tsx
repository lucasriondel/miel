import type { MouseEvent, ComponentType, SVGProps } from "react";
import { Archive, MailOpen, Trash2 } from "lucide-react";
import type { ListedMessage } from "../api/types";
import { useBatchMessageAction, type BatchFlagAction } from "../api/mutations";
import { iconButtonClass, iconButtonIconClass } from "./iconButton";

interface Props {
  messages: ListedMessage[];
  /**
   * What this set of messages is, for the button names: "high priority",
   * "Promotions". Two of these are on screen at once now — a priority section's
   * and, inside its card, one per category subgroup — so an unqualified "Archive
   * all" would be ambiguous to a screen reader and to a test looking for one
   * button by name.
   */
  scope?: string;
}

export const SectionActions = ({ messages, scope }: Props) => {
  const batch = useBatchMessageAction();

  if (messages.length === 0) return null;

  const accountId = messages[0].accountId;
  const ids = messages.filter((m) => m.accountId === accountId).map((m) => m.gmailMessageId);
  const hasUnread = messages.some((m) => m.labels.some((l) => l.name === "UNREAD"));

  // The section header offers the three flag actions only — the fifth needs a
  // label picked, which is the bulk bar's business (#147).
  const run = (action: BatchFlagAction) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    batch.mutate({ accountId, gmailMessageIds: ids, action });
  };

  const named = (verb: string) => (scope ? `${verb} ${scope}` : verb);

  return (
    // Always on screen (#144). These were hover-revealed, which made them
    // pointer-only: on a touch device the whole category could never be acted
    // on. Whether the row has space for them is the header's business — each
    // one holds them in a `shrink-0` cell — so all this owns is the buttons.
    <div className="flex items-center gap-1">
      <ActionButton
        Icon={MailOpen}
        label={named("Mark all as read")}
        onClick={run("read")}
        disabled={!hasUnread}
      />
      <ActionButton Icon={Archive} label={named("Archive all")} onClick={run("archive")} />
      <ActionButton Icon={Trash2} label={named("Delete all")} onClick={run("trash")} danger />
    </div>
  );
};

interface ActionButtonProps {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onClick: (e: MouseEvent) => void;
  danger?: boolean;
  disabled?: boolean;
}

const ActionButton = ({ Icon, label, onClick, danger, disabled }: ActionButtonProps) => {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      // The row actions' size and shape: these are tapped now, not just
      // clicked, and 28px was a small target for three buttons this close.
      className={iconButtonClass({ danger })}
    >
      <Icon className={iconButtonIconClass()} aria-hidden />
    </button>
  );
};
