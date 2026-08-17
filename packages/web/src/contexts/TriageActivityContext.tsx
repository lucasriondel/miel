import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface TriageActivity {
  /** True while a triage run is streaming — drives the untriaged section's rainbow glow. */
  triaging: boolean;
  setTriaging: (v: boolean) => void;
}

const Context = createContext<TriageActivity | null>(null);

/**
 * Shares "triage is running" across the tree. ActionIsland (which owns the sync
 * socket) writes it; UntriagedSection reads it to light its rainbow halo. Kept
 * as a context because the sync socket is per-`useSyncStream()` instance, so the
 * two components can't observe the same `isRunning` any other way.
 */
export const TriageActivityProvider = ({ children }: { children: ReactNode }) => {
  const [triaging, setTriaging] = useState(false);
  const value = useMemo(() => ({ triaging, setTriaging }), [triaging]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export const useTriageActivity = (): TriageActivity => {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useTriageActivity must be used within a TriageActivityProvider");
  }
  return ctx;
};
