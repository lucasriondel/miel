import { useEffect, useRef } from "react";
import { useSyncStream } from "../../api/syncSocket";

const THROTTLE_MS = 60_000;

// Build a range covering today (00:00 local) minus a 24h backstop, up to now.
// The backstop catches messages that arrived overnight after the last sync.
function buildFocusRange(now: Date): { from: string; to: string } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const from = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: now.toISOString() };
}

export function useFocusSync(accountEmail: string | undefined) {
  const { start, isRunning } = useSyncStream();
  const lastRunRef = useRef<number>(0);
  // Keep latest values in refs so the effect can stay mounted with [] deps
  // and not re-bind the focus listener every render.
  const accountEmailRef = useRef(accountEmail);
  const isRunningRef = useRef(isRunning);

  useEffect(() => {
    accountEmailRef.current = accountEmail;
  }, [accountEmail]);
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    const onFocus = () => {
      const email = accountEmailRef.current;
      if (!email) return;
      if (isRunningRef.current) return;
      const now = Date.now();
      if (now - lastRunRef.current < THROTTLE_MS) return;
      lastRunRef.current = now;
      start({ account: email, range: buildFocusRange(new Date(now)) });
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [start]);
}
