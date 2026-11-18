import type { Priority } from "../api/types";
import { cn } from "@/lib/utils";
import { MessageActions } from "./MessageActions";

interface Props {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  isUnread: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  priority: Priority | null;
  appliedLabelIds: readonly string[];
  /** The row's date, already formatted (`rowDate`). */
  date: string;
  showActions: boolean;
}

/**
 * The row's trailing cell: the date at rest, and — on hover, focus, or while
 * the row's label panel is open — the Row Actions toolbar in its place (Main
 * view › Row Actions).
 *
 * The toolbar is its own opaque surface (white, a hairline and a soft shadow),
 * so nothing has to be painted behind it: it floats over the end of the subject
 * line the way the design draws it. It is anchored to the row (`.message-row`
 * is the containing block — this cell is deliberately not `relative`) at the
 * first line's height, so a row with a second line of attachments keeps its
 * toolbar beside the subject rather than centred on the whole row.
 *
 * `group-data-[labelling=true]` is the third way in, beside hover and
 * focus-within (#170): the label panel is portalled to the body, so reaching
 * for a label takes the pointer off the row and the focus out of it, and the
 * toolbar would fade out from under its own popover. The row publishes the
 * flag; this is where it is read.
 */
export const MessageRowEndCell = ({ date, showActions, ...actions }: Props) => {
  const dateText = (
    <span
      className={cn(
        "text-xs whitespace-nowrap tabular-nums",
        actions.isUnread ? "font-semibold text-gousse-ink" : "text-gousse-muted",
        showActions &&
          "transition-opacity duration-150 group-focus-within:opacity-0 group-hover:opacity-0 group-data-[labelling=true]:opacity-0",
      )}
    >
      {date}
    </span>
  );
  return (
    <span className="hidden shrink-0 justify-end sm:flex sm:min-w-12">
      {dateText}
      {showActions ? (
        <span className="pointer-events-none absolute top-[7px] right-2 opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 group-data-[labelling=true]:pointer-events-auto group-data-[labelling=true]:opacity-100">
          <MessageActions {...actions} variant="row" forceVisible />
        </span>
      ) : null}
    </span>
  );
};
