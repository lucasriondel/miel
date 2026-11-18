import { useEffect, useState } from "react";
import type { Account } from "../../api/types";
import { cn } from "@/lib/utils";
import { useSidebarRail } from "./SidebarRailContext";
import { syncStatusLabel } from "./syncStatusLabel";

/**
 * The sidebar's last line (UI System › Sync Status): a dot and how long ago the
 * mailbox on screen was synced. Green once it has been, grey before.
 *
 * Re-renders once a minute so "2 min ago" does not freeze while the page sits
 * open.
 */
export const SidebarSyncStatus = ({ account }: { account: Account | undefined }) => {
  const rail = useSidebarRail();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  if (!account) return null;
  const synced = Boolean(account.lastSyncedAt);
  const dot = (
    <span
      aria-hidden
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full",
        synced ? "bg-gousse-low" : "bg-gousse-subtle",
      )}
    />
  );
  return rail ? (
    <div className="flex flex-col items-center gap-1.5 text-[11px] text-gousse-muted">
      {dot}
      <span>{syncStatusLabel(account.lastSyncedAt, now, true)}</span>
    </div>
  ) : (
    <div className="flex items-center gap-2 px-2.5 text-xs text-gousse-muted">
      {dot}
      <span className="truncate">{syncStatusLabel(account.lastSyncedAt, now)}</span>
    </div>
  );
};
