import { useEffect, useRef, useState } from "react";
import { useSyncStream } from "../../api/syncSocket";
import { useTriageActivity } from "../../contexts/TriageActivityContext";
import { Island } from "../Island";
import { TriageButton } from "./TriageButton";
import { SyncSplitButton } from "./SyncSplitButton";

interface Props {
  accountEmail: string | undefined;
}

type ActiveOp = "sync" | "triage" | null;

/**
 * Right island: AI triage trigger + the sync split button. They share one sync
 * socket (so only one runs at a time), but the loading animation must be scoped
 * to whichever button started the run — `activeOp` tracks that, cleared when the
 * socket goes idle.
 */
export const ActionIsland = ({ accountEmail }: Props) => {
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

  const onSync = (input: { since?: string; range?: { from: string; to: string } }) => {
    if (!accountEmail || isRunning) return;
    setActiveOp("sync");
    start({ account: accountEmail, ...input });
  };

  const onTriage = () => {
    if (!accountEmail || isRunning) return;
    setActiveOp("triage");
    startTriage({ account: accountEmail });
  };

  const busy = isRunning || activeOp !== null;

  return (
    <Island>
      <TriageButton
        onClick={onTriage}
        loading={activeOp === "triage"}
        disabled={!accountEmail || (busy && activeOp !== "triage")}
      />
      <SyncSplitButton
        isRunning={activeOp === "sync"}
        onSync={onSync}
        disabled={!accountEmail || (busy && activeOp !== "sync")}
      />
    </Island>
  );
};
