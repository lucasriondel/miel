import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import type { ListedMessage } from "../api/types";
import { LabelBadge } from "./LabelBadge";
import { SystemLabelBadge, isSystemLabel } from "./SystemLabelBadge";

interface Props {
  message: ListedMessage;
}

export const MessageRow = ({ message }: Props) => {
  const date = new Date(message.internalDate);
  const relative = Number.isNaN(date.getTime())
    ? ""
    : formatDistanceToNow(date, { addSuffix: true });
  const sender = message.fromName?.trim() || message.fromEmail;
  const subject = message.subject?.trim() || "(no subject)";
  const labels = message.labels.filter((l) => l.name !== "INBOX").slice(0, 3);

  return (
    <Link
      to={`/messages/${message.accountId}/${message.gmailMessageId}`}
      className="group flex items-center gap-3 border-b border-miel-line bg-white px-3 py-1.5 text-sm transition-colors last:border-b-0 hover:bg-miel-bg"
    >
      <span className="w-44 shrink-0 truncate font-medium text-miel-ink">
        {sender}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {labels.length > 0 ? (
          <span className="flex shrink-0 items-center gap-1">
            {labels.map((l) =>
              isSystemLabel(l.name) ? (
                <SystemLabelBadge key={l.id} name={l.name} />
              ) : (
                <LabelBadge key={l.id} name={l.name} />
              ),
            )}
          </span>
        ) : null}
        <span className="min-w-0 truncate">
          <span className="text-miel-ink">{subject}</span>
          {message.snippet ? (
            <span className="text-miel-muted"> - {message.snippet}</span>
          ) : null}
        </span>
      </div>
      <span className="shrink-0 text-xs text-miel-muted">{relative}</span>
    </Link>
  );
};
