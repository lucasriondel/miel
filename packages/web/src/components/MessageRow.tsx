import { Link, useLocation } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import type { ListedMessage } from "../api/types";
import { messageDetailPath } from "../features/inbox/inboxLocation";
import { rowDate } from "./rowDate";
import { presetTimeLabel } from "../features/time/timePresets";
import { cn } from "@/lib/utils";
import { MessageRowSecondLine } from "./MessageRowSecondLine";
import { MessageRowEndCell } from "./MessageRowEndCell";
import { MessageRowLabels } from "./MessageRowLabels";
import { MessageRowActions } from "./MessageRowActions";
import { rowLabelKey, useRowLabelPicker } from "../features/labels/rowLabelPickerContext";
import { useRowPromos } from "../features/promos/rowPromosContext";
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
 * The row carries no priority dot: the section it sits under is the priority
 * (req. 1), and the category band inside that section is the Gmail category
 * (req. 3), so neither needs restating per row.
 *
 * A second line appears only when there are attachments (req. 2) or promo
 * codes found in the mail, and it is static — rows never collapse, and nothing about hovering a row changes its
 * height or the position of anything in it (req. 9).
 */
export const MessageRow = ({ message, selectMode, selected, onToggleSelect }: Props) => {
  const date = new Date(message.internalDate);
  // A snoozed row (the Snoozed view) says when it comes back rather than when
  // it arrived: that is the one date that list is about.
  const dateText = message.snoozedUntil
    ? `Until ${presetTimeLabel(new Date(message.snoozedUntil), new Date())}`
    : rowDate(date);
  const sender = message.fromName?.trim() || message.fromEmail;
  const subject = message.subject?.trim() || "(no subject)";
  const isUnread = message.labels.some((l) => l.name === "UNREAD");
  // What the row's label picker marks as already added (#170). The ids, not the
  // labels: the picker offers the account's catalogue and only needs to know
  // which of those entries this message is carrying.
  const appliedLabelIds = message.labels.map((l) => l.id);
  // The inbox's scope rides along on the URL (#95): it is what the user comes
  // back to, and on a deep link it is all `useReturnToInbox` has to rebuild
  // the inbox from.
  const { search, pathname } = useLocation();
  const href = messageDetailPath(message.accountId, message.gmailMessageId, search);
  // The row whose message is open in the reader beside the list. Opening
  // another while one is open *replaces* the history entry: the entry behind
  // the reader stays the bare inbox, so leaving the reader (Back, archive,
  // delete) lands on the list rather than on the previous message.
  const openId = /\/messages\/([^/?]+)/.exec(pathname)?.[1];
  const current = openId === message.gmailMessageId;
  const replace = openId !== undefined;

  // Whether the list's one label panel is currently hanging off this row's
  // trigger (#170). The actions are revealed by hover and focus, and a panel
  // that is portalled to the body has neither — so the trigger would fade out
  // from under its own popover the moment the pointer reached it.
  const picker = useRowLabelPicker();
  const labelling = picker?.openRow === rowLabelKey(message);

  const promos = useRowPromos(message);

  const isMobile = useIsMobile();
  const showActions = !selectMode;
  const { revealed, close, handlers } = useSwipeReveal({
    enabled: isMobile && showActions,
  });

  return (
    <div
      {...(isMobile && showActions ? handlers : {})}
      data-labelling={labelling ? "true" : undefined}
      data-current={current ? "true" : undefined}
      className={cn(
        "message-row group relative flex flex-col text-[13px] transition-colors duration-150",
        selected && "bg-gousse-primary/[0.06]",
      )}
    >
      {/* The open message's row: a darker wash (index.css) and the brand ink
          as a bar down its left edge. */}
      {current ? (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-gousse-primary" />
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2.5 sm:h-11 sm:flex-nowrap sm:gap-3 sm:py-0">
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
            replace={replace}
            aria-current={current ? "true" : undefined}
            className="flex min-w-0 items-center gap-2 sm:w-[184px] sm:shrink-0"
          >
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                isUnread ? "bg-gousse-primary" : "bg-transparent",
              )}
            />
            <span
              className={cn(
                "truncate",
                isUnread ? "font-semibold text-gousse-ink" : "font-medium text-gousse-muted",
              )}
            >
              {sender}
            </span>
          </Link>
          <span
            className={cn(
              "shrink-0 text-xs whitespace-nowrap tabular-nums sm:hidden",
              isUnread ? "font-semibold text-gousse-ink" : "text-gousse-muted",
            )}
          >
            {dateText}
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
          <MessageRowLabels labels={message.labels} />
          <Link to={href} replace={replace} tabIndex={-1} className="min-w-0 flex-1 truncate">
            <span
              className={isUnread ? "font-semibold text-gousse-ink" : "font-medium text-gousse-ink"}
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
          appliedLabelIds={appliedLabelIds}
          isUnread={isUnread}
          isArchived={message.isArchived}
          isTrashed={message.isTrashed}
          priority={message.priority}
          snoozedUntil={message.snoozedUntil}
          date={dateText}
          showActions={showActions}
        />
      </div>
      <MessageRowSecondLine
        accountId={message.accountId}
        gmailMessageId={message.gmailMessageId}
        attachments={message.attachments}
        promos={promos}
      />
      {/* Mobile only: the swipe-revealed action strip, which is still an overlay
          because there is no room to reserve a cell for it. */}
      {showActions && isMobile && (
        <MessageRowActions
          accountId={message.accountId}
          accountEmail={message.accountEmail}
          gmailMessageId={message.gmailMessageId}
          appliedLabelIds={appliedLabelIds}
          isUnread={isUnread}
          isArchived={message.isArchived}
          isTrashed={message.isTrashed}
          priority={message.priority}
          snoozedUntil={message.snoozedUntil}
          isMobile
          revealed={revealed}
          onClose={close}
        />
      )}
    </div>
  );
};
