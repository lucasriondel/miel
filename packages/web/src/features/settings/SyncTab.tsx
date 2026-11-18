import { AutomaticSyncManager } from "./AutomaticSyncManager";
import { WorpCard } from "./WorpCard";

/**
 * Sync: the automatic schedule, then the worp relay.
 *
 * worp has no tab of its own in the design. It is an outbound integration miel
 * pushes attachments to (#107), not a source it reads from, and the nearest
 * neighbour it has is the background work on this tab — so it sits under the
 * schedule rather than earning a fifth tab for one card.
 */
export const SyncTab = () => (
  <>
    <AutomaticSyncManager />
    <WorpCard />
  </>
);
