import { format } from "date-fns";
import type { MessageDetail } from "../../api/types";
import { recipientLine } from "./recipientLine";
import { SenderAvatar } from "./SenderAvatar";

interface Props {
  message: MessageDetail;
}

/**
 * The one row the header shows at rest: who wrote, from what address, to how
 * many people, and when (#88). Everything else is behind `Details`.
 *
 * The address truncates with the full value on hover and the time is
 * `tabular-nums` and `shrink-0`, per §4 — a long address must eat its own
 * overflow rather than push the timestamp off the row.
 */
export const SenderLine = ({ message }: Props) => {
  const name = message.fromName?.trim() || null;
  const recipients = recipientLine(message.toEmails, message.accountEmail);
  const date = new Date(message.internalDate);
  const hasDate = !Number.isNaN(date.getTime());

  return (
    <div className="flex items-center gap-3">
      <SenderAvatar name={name} email={message.fromEmail} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            className="truncate text-sm font-bold text-gousse-ink"
            title={name ?? message.fromEmail}
          >
            {name ?? message.fromEmail}
          </span>
          {name && (
            <span
              className="truncate text-xs font-medium text-gousse-muted"
              title={message.fromEmail}
            >
              {message.fromEmail}
            </span>
          )}
        </div>
        {recipients && (
          <span className="truncate text-xs font-medium text-gousse-muted">{recipients}</span>
        )}
      </div>
      {hasDate && (
        <time
          dateTime={message.internalDate}
          title={format(date, "PPpp")}
          className="shrink-0 text-xs font-medium tabular-nums text-gousse-muted"
        >
          {format(date, "MMM d, p")}
        </time>
      )}
    </div>
  );
};
