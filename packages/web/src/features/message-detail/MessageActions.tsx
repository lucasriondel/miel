import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";
import {
  useArchiveMessage,
  useTrashMessage,
} from "../../api/mutations";
import { ApiError } from "../../api/client";
import type { MessageDetail } from "../../api/types";

interface Props {
  message: MessageDetail;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const MessageActions = ({ message }: Props) => {
  const navigate = useNavigate();
  const archive = useArchiveMessage();
  const trash = useTrashMessage();

  const input = {
    accountId: message.accountId,
    gmailMessageId: message.gmailMessageId,
  };

  const archiveDisabled =
    message.isArchived || archive.isPending || trash.isPending;
  const trashDisabled = message.isTrashed || archive.isPending || trash.isPending;

  const onArchive = () => {
    archive.mutate(input, {
      onSuccess: () => navigate("/"),
    });
  };

  const onTrash = () => {
    if (!confirm("Move this message to trash?")) return;
    trash.mutate(input, {
      onSuccess: () => navigate("/"),
    });
  };

  const error = archive.error ?? trash.error;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={archiveDisabled}
          onClick={onArchive}
        >
          {archive.isPending ? <Spinner /> : null}
          {message.isArchived ? "Archived" : "Archive"}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={trashDisabled}
          onClick={onTrash}
        >
          {trash.isPending ? <Spinner /> : null}
          {message.isTrashed ? "Trashed" : "Trash"}
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-miel-high">
          Action failed: {describeError(error)}
        </p>
      ) : null}
    </div>
  );
};
