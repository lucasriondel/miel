import type { MouseEvent, ComponentType, SVGProps } from "react";
import { Archive, MailOpen, Trash2 } from "lucide-react";
import type { ListedMessage } from "../api/types";
import {
  useBatchMessageAction,
  type BatchMessageAction,
} from "../api/mutations";

interface Props {
  messages: ListedMessage[];
}

export const SectionActions = ({ messages }: Props) => {
  const batch = useBatchMessageAction();

  if (messages.length === 0) return null;

  const accountId = messages[0].accountId;
  const ids = messages
    .filter((m) => m.accountId === accountId)
    .map((m) => m.gmailMessageId);
  const hasUnread = messages.some((m) =>
    m.labels.some((l) => l.name === "UNREAD"),
  );

  const run = (action: BatchMessageAction) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    batch.mutate({ accountId, gmailMessageIds: ids, action });
  };

  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/section:opacity-100">
      <ActionButton
        Icon={MailOpen}
        label="Mark all as read"
        onClick={run("read")}
        disabled={!hasUnread}
      />
      <ActionButton Icon={Archive} label="Archive all" onClick={run("archive")} />
      <ActionButton
        Icon={Trash2}
        label="Delete all"
        onClick={run("trash")}
        danger
      />
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

const ActionButton = ({
  Icon,
  label,
  onClick,
  danger,
  disabled,
}: ActionButtonProps) => {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-6 w-6 items-center justify-center rounded text-miel-muted transition-colors hover:bg-miel-line disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
        danger ? "hover:text-miel-high" : "hover:text-miel-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
};
