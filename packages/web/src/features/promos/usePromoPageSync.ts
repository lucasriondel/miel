import { useOutletContext } from "react-router-dom";
import { useSyncStream } from "../../api/syncSocket";
import type { DateRange } from "../sync/dateRange";
import { syncWindow } from "../sync/syncWindow";

/** The two layout fields the empty state's Sync needs, read defensively. */
interface SyncContext {
  range?: DateRange;
  selectedAccountEmail?: string;
}

/**
 * The empty page's "Sync now": the same sync the inbox's button starts — the
 * selected mailbox, the period the inbox is showing (#152) — reached through
 * the layout's context. Answers no `sync` when there is no layout above (a page
 * mounted alone) or no mailbox selected, and the button is then not drawn.
 */
export const usePromoPageSync = (): { sync?: () => void; syncing: boolean } => {
  const context = useOutletContext<SyncContext | undefined>();
  const { start, isRunning } = useSyncStream();
  const range = context?.range;
  const account = context?.selectedAccountEmail;
  if (!range || !account) return { syncing: isRunning };
  return {
    sync: () => {
      if (!isRunning) start({ account, range: syncWindow(range, new Date()) });
    },
    syncing: isRunning,
  };
};
