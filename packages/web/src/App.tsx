import { useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { useWeek, type Week } from "./features/sync/useWeek";
import { useAccounts } from "./api/queries";

export interface LayoutContext {
  selectedAccountId: string | undefined;
  selectedLabelId: string | undefined;
  weekStartIso: string;
  weekEndIso: string;
  week: Week;
  isCurrentWeek: boolean;
  canGoNext: boolean;
  goPrev: () => void;
  goNext: () => void;
  goToday: () => void;
  selectedAccountEmail: string | undefined;
}

export const App = () => {
  const accounts = useAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [selectedLabelId, setSelectedLabelId] = useState<string | undefined>();
  const { week, isCurrentWeek, canGoNext, goPrev, goNext, goToday } = useWeek();

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
      week,
      isCurrentWeek,
      canGoNext,
      goPrev,
      goNext,
      goToday,
      selectedAccountEmail: selectedAccount?.email,
    }),
    [
      selectedAccountId,
      selectedLabelId,
      week,
      isCurrentWeek,
      canGoNext,
      goPrev,
      goNext,
      goToday,
      selectedAccount?.email,
    ],
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
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 flex-col overflow-y-auto">
          <Outlet context={outletContext} />
        </div>
      </main>
    </div>
  );
};
