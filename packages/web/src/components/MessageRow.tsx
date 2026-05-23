import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import type { ListedMessage } from "../api/types";
import { MessageLabels } from "./MessageLabels";
import { MessageRowActions } from "./MessageRowActions";

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
  const isUnread = message.labels.some((l) => l.name === "UNREAD");
  const href = `/messages/${message.accountId}/${message.gmailMessageId}`;

  return (
    <div className="group relative flex items-center gap-3 border-b border-miel-line bg-miel-panel px-3 py-1.5 text-sm transition-colors last:border-b-0 hover:bg-miel-bg">
      <Link
        to={href}
        className={`w-44 shrink-0 truncate text-miel-ink hover:underline ${isUnread ? "font-semibold" : "font-normal"}`}
      >
        {sender}
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <MessageLabels
          accountId={message.accountId}
          gmailMessageId={message.gmailMessageId}
          triageId={message.triageId}
          labels={message.labels}
          existingSuggestions={message.pendingSuggestions.existing}
          newSuggestions={message.pendingSuggestions.new}
          variant="row"
        />
        <Link to={href} className="min-w-0 truncate hover:underline">
          <span className={`text-miel-ink ${isUnread ? "font-semibold" : ""}`}>
            {subject}
          </span>
          {message.snippet ? (
            <span className="text-miel-muted"> - {message.snippet}</span>
          ) : null}
        </Link>
      </div>
      <span className="shrink-0 text-xs text-miel-muted">{relative}</span>
      <MessageRowActions
        accountId={message.accountId}
        gmailMessageId={message.gmailMessageId}
        isUnread={isUnread}
      />
    </div>
  );
};
