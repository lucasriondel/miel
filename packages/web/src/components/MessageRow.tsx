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
    <div className="group relative flex flex-col border-b border-miel-line bg-miel-panel px-3 py-1.5 text-sm transition-colors last:border-b-0 hover:bg-miel-bg sm:flex-row sm:items-center sm:gap-3">
      {/* Mobile: row 1 (sender + date). Desktop: sender joins parent flex via sm:contents */}
      <div className="flex items-baseline justify-between gap-2 sm:contents">
        <Link
          to={href}
          className={`truncate text-miel-ink hover:underline sm:w-44 sm:shrink-0 ${isUnread ? "font-semibold" : "font-normal"}`}
        >
          {sender}
        </Link>
        <span className="shrink-0 text-xs text-miel-muted sm:hidden">{relative}</span>
      </div>
      {/* Mobile: row 2 (labels + subject). Desktop: flex-1 content area */}
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
      <span className="hidden shrink-0 text-xs text-miel-muted sm:inline">{relative}</span>
      <MessageRowActions
        accountId={message.accountId}
        gmailMessageId={message.gmailMessageId}
        isUnread={isUnread}
      />
    </div>
  );
};
