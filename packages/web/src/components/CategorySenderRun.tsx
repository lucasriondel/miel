interface Props {
  senders: string[];
}

/**
 * The one-line preview a collapsed group shows (req. 7): `sender1, sender2, …`,
 * truncating with an ellipsis the way Google Inbox did.
 *
 * It takes the header's flexible space and is the one element there allowed to
 * give way, so the category's name, its count and its actions all keep their
 * intrinsic width and the run absorbs whatever is left. How many names fit is
 * therefore the window's business rather than a number written here — a wider
 * window simply shows more of the same run.
 *
 * Each sender appears once (`senderRun` dedupes), so a thread of six replies
 * does not spend the whole line on one name.
 */
export const CategorySenderRun = ({ senders }: Props) => {
  if (senders.length === 0) return null;

  return (
    <span className="min-w-0 flex-1 truncate text-left text-xs font-medium text-gousse-muted">
      {senders.join(", ")}
    </span>
  );
};
