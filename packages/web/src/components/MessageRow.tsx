import { Link, useLocation } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import type { ListedMessage } from "../api/types";
import { messageDetailPath } from "../features/inbox/inboxLocation";
import { MessageAttachments } from "./MessageAttachments";
import { MessageLabels } from "./MessageLabels";
import { MessageRowActions } from "./MessageRowActions";
import { useIsMobile } from "../hooks/useMediaQuery";
import { useSwipeReveal } from "../hooks/useSwipeReveal";

interface Props {
  message: ListedMessage;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (accountId: string, gmailMessageId: string) => void;
}

export const MessageRow = ({ message, selectMode, selected, onToggleSelect }: Props) => {
  const date = new Date(message.internalDate);
  const relative = Number.isNaN(date.getTime())
    ? ""
    : formatDistanceToNow(date, { addSuffix: true });
  const sender = message.fromName?.trim() || message.fromEmail;
  const subject = message.subject?.trim() || "(no subject)";
  const isUnread = message.labels.some((l) => l.name === "UNREAD");
  // The inbox's scope rides along on the URL (#95): it is what the user comes
  // back to, and on a deep link it is all `useReturnToInbox` has to rebuild
  // the inbox from.
  const { search } = useLocation();
  const href = messageDetailPath(message.accountId, message.gmailMessageId, search);

  const isMobile = useIsMobile();
  const showActions = !selectMode;
  const { revealed, close, handlers } = useSwipeReveal({
    enabled: isMobile && showActions,
  });

  return (
    <div
      {...(isMobile && showActions ? handlers : {})}
      className={`group relative flex flex-col px-4 py-2.5 text-sm transition-all duration-200 hover:bg-gousse-bg hover:shadow-gousse-md sm:flex-row sm:items-center sm:gap-4 active:scale-[0.99] ${
        selected ? "bg-gousse-accent/[0.08]" : "bg-gousse-panel"
      }`}
    >
      {selectMode && (
        // Not an action: the handler exists only so that ticking the checkbox
        // does not also open the message behind it. There is nothing for a key
        // handler to mirror — the checkbox itself takes the keyboard.
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- see above
        <label
          className="flex shrink-0 items-center pr-1 sm:pr-0"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="sr-only">Select message</span>
          <Checkbox
            checked={!!selected}
            onChange={() => onToggleSelect?.(message.accountId, message.gmailMessageId)}
          />
        </label>
      )}
      {/* Mobile: row 1 (sender + date). Desktop: sender joins parent flex via sm:contents */}
      <div className="flex items-baseline justify-between gap-2 sm:contents">
        <Link
          to={href}
          className={`truncate text-gousse-ink hover:underline sm:w-48 sm:shrink-0 transition-colors ${isUnread ? "font-bold text-gousse-ink" : "font-medium text-gousse-muted hover:text-gousse-ink"}`}
        >
          {sender}
        </Link>
        <span className="shrink-0 text-xs font-medium text-gousse-muted tabular-nums sm:hidden">
          {relative}
        </span>
      </div>
      {/* Mobile: row 2 (subject + labels at end). Desktop: flex-1 content area with labels before subject */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <MessageAttachments
          accountId={message.accountId}
          gmailMessageId={message.gmailMessageId}
          attachments={message.attachments}
          variant="row"
        />
        <MessageLabels
          accountId={message.accountId}
          gmailMessageId={message.gmailMessageId}
          triageId={message.triageId}
          labels={message.labels}
          existingSuggestions={message.pendingSuggestions.existing}
          newSuggestions={message.pendingSuggestions.new}
          variant="row"
          className="order-last ml-auto sm:order-none sm:ml-0"
        />
        <Link
          to={href}
          className="order-first min-w-0 flex-1 truncate hover:underline sm:order-none sm:flex-initial"
        >
          <span
            className={`transition-colors ${isUnread ? "font-bold text-gousse-ink" : "font-medium text-gousse-ink"}`}
          >
            {subject}
          </span>
          {message.snippet ? (
            <span className="text-gousse-muted transition-colors"> · {message.snippet}</span>
          ) : null}
        </Link>
      </div>
      <span className="hidden shrink-0 text-xs font-medium text-gousse-muted tabular-nums sm:inline">
        {relative}
      </span>
      {showActions && (
        <MessageRowActions
          accountId={message.accountId}
          accountEmail={message.accountEmail}
          gmailMessageId={message.gmailMessageId}
          isUnread={isUnread}
          isArchived={message.isArchived}
          isTrashed={message.isTrashed}
          priority={message.priority}
          isMobile={isMobile}
          revealed={revealed}
          onClose={close}
        />
      )}
    </div>
  );
};
