import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import type { ListedMessage } from "../api/types";
import { LabelBadge } from "./LabelBadge";

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
  return (
    <Link
      to={`/messages/${message.accountId}/${message.gmailMessageId}`}
      className="flex flex-col gap-1 rounded-md border border-miel-line bg-white px-3 py-2 transition-colors hover:border-miel-accent/40 hover:bg-miel-bg"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-miel-ink">
          {sender}
        </span>
        <span className="shrink-0 text-xs text-miel-muted">{relative}</span>
      </div>
      <p className="truncate text-sm text-miel-ink">{subject}</p>
      {message.snippet ? (
        <p className="line-clamp-1 text-xs text-miel-muted">
          {message.snippet}
        </p>
      ) : null}
      {message.labels.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {message.labels
            .filter((l) => l.name !== "INBOX")
            .slice(0, 6)
            .map((l) => (
              <LabelBadge key={l.id} name={l.name} />
            ))}
        </div>
      ) : null}
    </Link>
  );
};
