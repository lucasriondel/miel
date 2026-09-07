import { Link, useLocation } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import type { ListedMessage } from "../api/types";
import { messageDetailPath } from "../features/inbox/inboxLocation";
import { relativeAge } from "./relativeAge";
import { MessageRowAttachmentLine } from "./MessageRowAttachmentLine";
import { MessageRowEndCell } from "./MessageRowEndCell";
import { MessageRowLabels } from "./MessageRowLabels";
import { MessageRowActions } from "./MessageRowActions";
import { SuggestionPill } from "./SuggestionPill";
import { useIsMobile } from "../hooks/useMediaQuery";
import { useSwipeReveal } from "../hooks/useSwipeReveal";

interface Props {
  message: ListedMessage;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (accountId: string, gmailMessageId: string) => void;
}

/**
 * One message in the inbox list.
 *
 * The shape is fixed on purpose. Every row's subject starts at the same x
 * because everything to its left is a fixed-width column — the sender, and the
 * user's labels which sit in front of it — and everything to its right is a
 * fixed-width column too: the end cell. Metadata changing on a message
 * therefore repaints it and never reflows the line, which is what the
 * one-flex-line version could not promise.
 *
 * The suggestion trigger used to be a third such column, an empty 2.5rem
 * reserved at the row's end on every row that had nothing suggested. It is a
 * constant-width member of the label group now (see `MessageRowLabels`), which
 * keeps that promise without spending the width.
 *
 * The row carries no priority dot: the section it sits under is the priority
 * (req. 1), and the category band inside that section is the Gmail category
 * (req. 3), so neither needs restating per row.
 *
 * A second line appears only when there are attachments (req. 2), and it is
 * static — rows never collapse, and nothing about hovering a row changes its
 * height or the position of anything in it (req. 9).
 */
export const MessageRow = ({ message, selectMode, selected, onToggleSelect }: Props) => {
  const date = new Date(message.internalDate);
  const relative = Number.isNaN(date.getTime()) ? "" : relativeAge(date);
  const sender = message.fromName?.trim() || message.fromEmail;
  const subject = message.subject?.trim() || "(no subject)";
  const isUnread = message.labels.some((l) => l.name === "UNREAD");
  // The same two conditions `SuggestionPill` returns null on. No triage is no
  // suggestion to act on: the ids the routes take are that run's.
  const hasSuggestions =
    message.triageId !== null &&
    message.pendingSuggestions.existing.length + message.pendingSuggestions.new.length > 0;
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
      className={`message-row group relative flex flex-col text-sm transition-colors duration-150 ${
        selected ? "bg-gousse-accent/[0.08]" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2.5 sm:flex-nowrap sm:gap-3">
        {selectMode && (
          // Not an action: the handler exists only so that ticking the checkbox
          // does not also open the message behind it. There is nothing for a key
          // handler to mirror — the checkbox itself takes the keyboard.
          // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- see above
          <label className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
            <span className="sr-only">Select message</span>
            <Checkbox
              checked={!!selected}
              onChange={() => onToggleSelect?.(message.accountId, message.gmailMessageId)}
            />
          </label>
        )}
        {/* Mobile: row 1 (sender + date). Desktop: sender is the first fixed column. */}
        <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2 sm:contents">
          <Link
            to={href}
            className={`truncate transition-colors hover:underline sm:w-44 sm:shrink-0 ${
              isUnread
                ? "font-bold text-gousse-ink"
                : "font-medium text-gousse-muted hover:text-gousse-ink"
            }`}
          >
            {sender}
          </Link>
          <span className="shrink-0 whitespace-nowrap text-xs font-medium text-gousse-muted tabular-nums sm:hidden">
            {relative}
          </span>
        </div>
        {/* The flexible middle: the labels keep their width and the subject line
            is the only thing that gives way, so the truncation always happens in
            the one place there is more text than room.

            Below `sm` this whole cell drops to the row's second line — via the
            wrapper's `flex-wrap` and this `basis-full` — rather than being drawn
            a second time. Two copies would read the subject out twice to a
            screen reader and give the row two nodes to keep in step. */}
        <div className="flex min-w-0 basis-full items-center gap-2 sm:basis-auto sm:flex-1">
          {/* The trigger leads the label group rather than sitting in a slot of
              its own: it is a constant 20px whatever Claude said, so it can be
              a member of that list without any row's subject depending on the
              model's verbosity.

              Whether there is one is decided here rather than by handing the
              group an element that may render nothing: `MessageRowLabels` sees a
              prop, not what it returns, so a `SuggestionPill` that renders null
              would still count as a member and leave the group drawn — an empty
              flex child spending the row's `gap-2` in front of every unlabelled
              subject, which is the gap this design promises not to keep. */}
          <MessageRowLabels
            labels={message.labels}
            suggestion={
              hasSuggestions ? (
                <SuggestionPill
                  accountId={message.accountId}
                  gmailMessageId={message.gmailMessageId}
                  triageId={message.triageId}
                  existingSuggestions={message.pendingSuggestions.existing}
                  newSuggestions={message.pendingSuggestions.new}
                />
              ) : null
            }
          />
          <Link to={href} className="min-w-0 flex-1 truncate hover:underline">
            <span
              className={isUnread ? "font-bold text-gousse-ink" : "font-medium text-gousse-ink"}
            >
              {subject}
            </span>
            {message.snippet ? (
              <span className="text-gousse-muted"> · {message.snippet}</span>
            ) : null}
          </Link>
        </div>
        <MessageRowEndCell
          accountId={message.accountId}
          accountEmail={message.accountEmail}
          gmailMessageId={message.gmailMessageId}
          isUnread={isUnread}
          isArchived={message.isArchived}
          isTrashed={message.isTrashed}
          priority={message.priority}
          relative={relative}
          showActions={showActions}
        />
      </div>
      <MessageRowAttachmentLine
        accountId={message.accountId}
        gmailMessageId={message.gmailMessageId}
        attachments={message.attachments}
      />
      {/* Mobile only: the swipe-revealed action strip, which is still an overlay
          because there is no room to reserve a cell for it. */}
      {showActions && isMobile && (
        <MessageRowActions
          accountId={message.accountId}
          accountEmail={message.accountEmail}
          gmailMessageId={message.gmailMessageId}
          isUnread={isUnread}
          isArchived={message.isArchived}
          isTrashed={message.isTrashed}
          priority={message.priority}
          isMobile
          revealed={revealed}
          onClose={close}
        />
      )}
    </div>
  );
};
