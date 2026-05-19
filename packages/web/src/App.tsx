import { useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import {
  SyncStatusBanner,
} from "./features/sync/SyncStatusBanner";
import { useAccounts } from "./api/queries";

export interface LayoutContext {
  selectedAccountId: string | undefined;
  selectedLabelId: string | undefined;
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

  useEffect(() => {
    if (!selectedAccountId && accounts.data && accounts.data.length > 0) {
      setSelectedAccountId(accounts.data[0].id);
    }
  }, [accounts.data, selectedAccountId]);

  const outletContext = useMemo<LayoutContext>(
    () => ({ selectedAccountId, selectedLabelId }),
    [selectedAccountId, selectedLabelId],
  );

  return (
    <div className="flex h-full min-h-screen">
      <Sidebar
        accounts={accounts.data ?? []}
        selectedAccountId={selectedAccountId}
        onSelectAccount={(id) => {
          setSelectedAccountId(id);
          setSelectedLabelId(undefined);
        }}
        selectedLabelId={selectedLabelId}
        onSelectLabel={(id) => setSelectedLabelId(id)}
        onSyncResult={(info) =>
          setSyncStatus({
            kind: "ok",
            fetched: info.fetched,
            triaged: info.triaged,
            errors: info.errors,
          })
        }
      />
      <main className="flex-1 overflow-y-auto p-6">
        <SyncStatusBanner
          status={syncStatus}
          onDismiss={() => setSyncStatus({ kind: "idle" })}
        />
        <Outlet context={outletContext} />
      </main>
    </div>
  );
};
