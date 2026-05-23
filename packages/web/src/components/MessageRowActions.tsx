import type { ComponentType, SVGProps } from "react";
import { Archive, Mail, MailOpen, Trash2 } from "lucide-react";
import {
  useArchiveMessage,
  useSetMessageRead,
  useTrashMessage,
} from "../api/mutations";

interface Props {
  accountId: string;
  gmailMessageId: string;
  isUnread: boolean;
}

export const MessageRowActions = ({
  accountId,
  gmailMessageId,
  isUnread,
}: Props) => {
  const setRead = useSetMessageRead();
  const archive = useArchiveMessage();
  const trash = useTrashMessage();

  const input = { accountId, gmailMessageId };

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1 bg-gradient-to-l from-miel-bg via-miel-bg/95 to-transparent pl-12 pr-3 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
      <ActionButton
        Icon={isUnread ? MailOpen : Mail}
        label={isUnread ? "Mark as read" : "Mark as unread"}
        onClick={() => setRead.mutate({ ...input, read: isUnread })}
      />
      <ActionButton
        Icon={Archive}
        label="Archive"
        onClick={() => archive.mutate(input)}
      />
      <ActionButton
        Icon={Trash2}
        label="Delete"
        onClick={() => trash.mutate(input)}
        danger
      />
    </div>
  );
};

interface ActionButtonProps {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

const ActionButton = ({ Icon, label, onClick, danger }: ActionButtonProps) => {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`group/btn relative inline-flex h-7 w-7 items-center justify-center rounded text-miel-muted transition-colors hover:bg-miel-line ${
        danger ? "hover:text-miel-high" : "hover:text-miel-ink"
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
};
