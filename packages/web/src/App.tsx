import { useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { SyncBar } from "./features/sync/SyncBar";
import { SyncStatusBanner } from "./features/sync/SyncStatusBanner";
import { useWeek } from "./features/sync/useWeek";
import { useAccounts } from "./api/queries";

export interface LayoutContext {
  selectedAccountId: string | undefined;
  selectedLabelId: string | undefined;
  weekStartIso: string;
  weekEndIso: string;
}

type SyncStatus =
  | { kind: "idle" }
  | { kind: "ok"; fetched: number; triaged: number; errors: string[] }
  | { kind: "error"; message: string };

export const App = () => {
  const accounts = useAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [selectedLabelId, setSelectedLabelId] = useState<string | undefined>();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: "idle" });
  const { week, isCurrentWeek, goPrev, goNext, goToday } = useWeek();

  useEffect(() => {
    if (!selectedAccountId && accounts.data && accounts.data.length > 0) {
      setSelectedAccountId(accounts.data[0].id);
    }
  }, [accounts.data, selectedAccountId]);

  const selectedAccount = accounts.data?.find((a) => a.id === selectedAccountId);

  const outletContext = useMemo<LayoutContext>(
    () => ({
      selectedAccountId,
      selectedLabelId,
      weekStartIso: week.start.toISOString(),
      weekEndIso: week.end.toISOString(),
    }),
    [selectedAccountId, selectedLabelId, week.start, week.end],
  );

  return (
    <div className="flex h-full min-h-screen">
      <Sidebar
        selectedAccountId={selectedAccountId}
        onSelectAccount={(id) => {
          setSelectedAccountId(id);
          setSelectedLabelId(undefined);
        }}
        selectedLabelId={selectedLabelId}
        onSelectLabel={(id) => setSelectedLabelId(id)}
      />
      <main className="flex-1 overflow-y-auto p-6">
        <SyncBar
          week={week}
          isCurrentWeek={isCurrentWeek}
          onPrevWeek={goPrev}
          onNextWeek={goNext}
          onToday={goToday}
          accountEmail={selectedAccount?.email}
          onSyncResult={(info) =>
            setSyncStatus({
              kind: "ok",
              fetched: info.fetched,
              triaged: info.triaged,
              errors: info.errors,
            })
          }
          onSyncError={(message) => setSyncStatus({ kind: "error", message })}
        />
        <SyncStatusBanner
          status={syncStatus}
          onDismiss={() => setSyncStatus({ kind: "idle" })}
        />
        <Outlet context={outletContext} />
      </main>
    </div>
  );
};
