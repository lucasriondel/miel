import { format, formatDistanceToNowStrict } from "date-fns";

/**
 * "Synced 1 min ago" beside a connected mailbox: a green dot once it has
 * synced, a grey one before it ever has. The exact time rides in the tooltip —
 * the row says how fresh, the hover says when.
 */
export const AccountSyncMeta = ({ lastSyncedAt }: { lastSyncedAt: string | null }) => {
  const at = lastSyncedAt ? new Date(lastSyncedAt) : null;
  return (
    <span
      className="hidden items-center gap-1.5 text-xs text-gousse-muted tabular-nums sm:flex"
      title={at ? format(at, "PPp") : undefined}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${at ? "bg-gousse-low" : "bg-gousse-subtle"}`}
      />
      {at ? `Synced ${formatDistanceToNowStrict(at, { addSuffix: true })}` : "Never synced"}
    </span>
  );
};
