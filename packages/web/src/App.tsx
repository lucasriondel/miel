import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { useDateRange, type DateRange, type ViewMode } from "./features/sync/useDateRange";
import { useFocusSync } from "./features/sync/useFocusSync";
import { useAccounts } from "./api/queries";
import { useConnectResult } from "./hooks/useConnectResult";
import { OnboardingGate } from "./features/onboarding/OnboardingGate";
import { TriageActivityProvider } from "./contexts/TriageActivityContext";
import { useScrollRestoration } from "./hooks/useScrollRestoration";

export interface LayoutContext {
  selectedAccountId: string | undefined;
  selectedLabelId: string | undefined;
  rangeStartIso: string;
  rangeEndIso: string;
  range: DateRange;
  isCurrentPeriod: boolean;
  canGoNext: boolean;
  goPrev: () => void;
  goNext: () => void;
  goToday: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selectedAccountEmail: string | undefined;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export const App = () => {
  const accounts = useAccounts();
  const { accountId: routeAccountId } = useParams<{ accountId?: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  // On the layout, not on a page: the OAuth callback lands on whichever page
  // the connect started from. A failure that left us with zero accounts comes
  // back here for the gate to show, since the gate is what the user is looking
  // at; anything else it reports itself, as a toast.
  const { gateError, clearGateError } = useConnectResult();
  // Standalone routes (settings, logs) don't belong to an account and must not
  // be redirected into /account/:id by the default-account effect below.
  const isAccountScope = pathname === "/" || pathname.startsWith("/account");
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [selectedLabelId, setSelectedLabelId] = useState<string | undefined>();
  const { range, isCurrentPeriod, canGoNext, goPrev, goNext, goToday, viewMode, setViewMode } =
    useDateRange();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("miel.sidebar.collapsed") === "1",
  );
  // The app's one scrolling element. Nothing above it scrolls, so returning
  // from a message — or from a delete that leaves one — comes back to the
  // offset the list was left at (#95).
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollRestoration(scrollRef);
  const onToggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      localStorage.setItem("miel.sidebar.collapsed", next ? "1" : "0");
      return next;
    });
  }, []);

  useEffect(() => {
    if (accounts.data && accounts.data.length > 0) {
      const validAccount = routeAccountId
        ? accounts.data.find((a) => a.id === routeAccountId)
        : accounts.data[0];
      if (validAccount && selectedAccountId !== validAccount.id) {
        setSelectedAccountId(validAccount.id);
        if (!routeAccountId && isAccountScope) {
          navigate(`/account/${validAccount.id}`, { replace: true });
        }
      }
    }
  }, [accounts.data, routeAccountId, selectedAccountId, navigate, isAccountScope]);

  useEffect(() => {
    const labelFromUrl = params.get("label");
    if (labelFromUrl !== null) {
      setSelectedLabelId(labelFromUrl || undefined);
    }
  }, [params]);

  const selectedAccount = accounts.data?.find((a) => a.id === selectedAccountId);

  useFocusSync(selectedAccount?.email);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.code === "KeyU" && accounts.data && accounts.data.length > 0) {
        e.preventDefault();
        const currentIndex = accounts.data.findIndex((a) => a.id === selectedAccountId);
        const nextIndex = (currentIndex + 1) % accounts.data.length;
        setSelectedAccountId(accounts.data[nextIndex].id);
        navigate(`/account/${accounts.data[nextIndex].id}`, { replace: true });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedAccountId, accounts.data, navigate]);

  const outletContext = useMemo<LayoutContext>(
    () => ({
      selectedAccountId,
      selectedLabelId,
      rangeStartIso: range.start.toISOString(),
      rangeEndIso: range.end.toISOString(),
      range,
      isCurrentPeriod,
      canGoNext,
      goPrev,
      goNext,
      goToday,
      viewMode,
      setViewMode,
      selectedAccountEmail: selectedAccount?.email,
      sidebarCollapsed,
      onToggleSidebar,
    }),
    [
      selectedAccountId,
      selectedLabelId,
      range,
      isCurrentPeriod,
      canGoNext,
      goPrev,
      goNext,
      goToday,
      viewMode,
      setViewMode,
      selectedAccount?.email,
      sidebarCollapsed,
      onToggleSidebar,
    ],
  );

  const handleSelectLabel = useCallback(
    (id: string | undefined) => {
      setSelectedLabelId(id);
      if (!selectedAccountId) return;
      const query = id ? `?label=${encodeURIComponent(id)}` : "";
      navigate(`/account/${selectedAccountId}${query}`);
    },
    [selectedAccountId, navigate],
  );

  return (
    <TriageActivityProvider>
      {/* Mounted on the layout, so the gate covers every route below it. */}
      <OnboardingGate error={gateError} onRetry={clearGateError} />
      <div className="flex h-full min-h-screen">
        <Sidebar
          selectedAccountId={selectedAccountId}
          selectedLabelId={selectedLabelId}
          onSelectLabel={handleSelectLabel}
          collapsed={sidebarCollapsed}
          onToggle={onToggleSidebar}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div
            ref={scrollRef}
            className="flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
          >
            <Outlet context={outletContext} />
          </div>
        </main>
      </div>
    </TriageActivityProvider>
  );
};
