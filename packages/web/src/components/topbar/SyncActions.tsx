import { useEffect, useRef, useState } from "react";
import { useSyncStream } from "../../api/syncSocket";
import { useTriageActivity } from "../../contexts/TriageActivityContext";
import { syncWindow } from "../../features/sync/syncWindow";
import type { DateRange } from "../../features/sync/dateRange";
import { TriageButton } from "./TriageButton";
import { SyncButton } from "./SyncButton";

interface Props {
  accountEmail: string | undefined;
  /** The period on screen — what a press of Sync fetches (#152). */
  range: DateRange;
}

type ActiveOp = "sync" | "triage" | null;

/**
 * The inbox bar's trailing cluster: AI triage trigger + the sync button. They share one sync
 * socket (so only one runs at a time), but the loading animation must be scoped
 * to whichever button started the run — `activeOp` tracks that, cleared when the
 * socket goes idle.
 *
 * The request's window is derived here, at the press, rather than held anywhere:
 * the period selector is the only source, so there is nothing to keep in sync
 * with it and nothing stored that could disagree.
 */
export const SyncActions = ({ accountEmail, range }: Props) => {
  const { start, startTriage, isRunning } = useSyncStream();
  const { setTriaging } = useTriageActivity();
  const [activeOp, setActiveOp] = useState<ActiveOp>(null);
  const wasRunning = useRef(false);

  // Clear the active op once the run finishes (isRunning true -> false).
  useEffect(() => {
    if (wasRunning.current && !isRunning) setActiveOp(null);
    wasRunning.current = isRunning;
  }, [isRunning]);

  // Broadcast triage-in-progress so the untriaged section can wear the rainbow
  // glow while Claude Code works.
  useEffect(() => {
    setTriaging(activeOp === "triage" && isRunning);
  }, [activeOp, isRunning, setTriaging]);

  const onSync = () => {
    if (!accountEmail || isRunning) return;
    setActiveOp("sync");
    start({ account: accountEmail, range: syncWindow(range, new Date()) });
  };

  const onTriage = () => {
    if (!accountEmail || isRunning) return;
    setActiveOp("triage");
    startTriage({ account: accountEmail });
  };

  const busy = isRunning || activeOp !== null;

  return (
    <div className="flex items-center gap-2">
      <TriageButton
        onClick={onTriage}
        loading={activeOp === "triage"}
        disabled={!accountEmail || (busy && activeOp !== "triage")}
      />
      <SyncButton
        range={range}
        isRunning={activeOp === "sync"}
        onSync={onSync}
        disabled={!accountEmail || (busy && activeOp !== "sync")}
      />
    </div>
  );
};
