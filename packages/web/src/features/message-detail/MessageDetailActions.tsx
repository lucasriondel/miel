import type { ComponentType, SVGProps } from "react";
import { Archive, Mail, MailOpen, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  useArchiveMessage,
  useSetMessageRead,
  useTrashMessage,
} from "../../api/mutations";
import { Spinner } from "../../components/Spinner";

interface Props {
  accountId: string;
  gmailMessageId: string;
  isUnread: boolean;
  isArchived: boolean;
  isTrashed: boolean;
}

export const MessageDetailActions = ({
  accountId,
  gmailMessageId,
  isUnread,
  isArchived,
  isTrashed,
}: Props) => {
  const navigate = useNavigate();
  const setRead = useSetMessageRead();
  const archive = useArchiveMessage();
  const trash = useTrashMessage();

  const input = { accountId, gmailMessageId };
  const busy = setRead.isPending || archive.isPending || trash.isPending;

  const onToggleRead = () => {
    setRead.mutate({ ...input, read: isUnread });
  };
  const onArchive = () => {
    archive.mutate(input, { onSuccess: () => navigate("/") });
  };
  const onTrash = () => {
    if (!confirm("Move this message to trash?")) return;
    trash.mutate(input, { onSuccess: () => navigate("/") });
  };

  return (
    <div className="flex items-center gap-1">
      <ActionButton
        Icon={isUnread ? MailOpen : Mail}
        label={isUnread ? "Mark as read" : "Mark as unread"}
        onClick={onToggleRead}
        disabled={busy}
        loading={setRead.isPending}
      />
      <ActionButton
        Icon={Archive}
        label={isArchived ? "Archived" : "Archive"}
        onClick={onArchive}
        disabled={busy || isArchived}
        loading={archive.isPending}
      />
      <ActionButton
        Icon={Trash2}
        label={isTrashed ? "Trashed" : "Delete"}
        onClick={onTrash}
        disabled={busy || isTrashed}
        loading={trash.isPending}
        danger
      />
    </div>
  );
};

interface ActionButtonProps {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
}

const ActionButton = ({
  Icon,
  label,
  onClick,
  disabled,
  loading,
  danger,
}: ActionButtonProps) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex h-8 w-8 items-center justify-center rounded text-miel-muted transition-colors hover:bg-miel-line disabled:cursor-not-allowed disabled:opacity-40 ${
      danger ? "hover:text-miel-high" : "hover:text-miel-ink"
    }`}
  >
    {loading ? <Spinner size={14} /> : <Icon className="h-4 w-4" aria-hidden />}
  </button>
);
