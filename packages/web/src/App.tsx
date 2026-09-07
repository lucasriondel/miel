import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { useDateRange, type DateRange, type RangeMode } from "./features/sync/useDateRange";
import { useFocusSync } from "./features/sync/useFocusSync";
import { useAccounts } from "./api/queries";
import { useConnectResult } from "./hooks/useConnectResult";
import { OnboardingGate } from "./features/onboarding/OnboardingGate";
import { TriageActivityProvider } from "./contexts/TriageActivityContext";
import { useScrollRestoration } from "./hooks/useScrollRestoration";
import { AppShell, AppMain, TopBar, AppContent } from "@/components/ui/app-shell";
import { TopBarNodeProvider } from "./features/shell/PageTopBar";

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
  setViewMode: (mode: RangeMode) => void;
  selectedAccountEmail: string | undefined;
}

/** Tailwind's `sm` breakpoint, below which `SidebarShell` renders as a drawer. */
const DRAWER_VIEWPORT = "(max-width: 639px)";
const isDrawerViewport = () => window.matchMedia(DRAWER_VIEWPORT).matches;

export const App = () => {
  const accounts = useAccounts();
  const { accountId: routeAccountId } = useParams<{ accountId?: string }>();
  const navigate = useNavigate();
  const { pathname, key: locationKey } = useLocation();
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
  const { range, isCurrentPeriod, canGoNext, goPrev, goNext, goToday, setViewMode } =
    useDateRange();
  // Below `sm` the sidebar is a drawer over the page, not a column beside it,
  // so it starts closed there whatever the desktop preference says — and
  // closes again on every navigation, since a row that was just tapped has
  // done its job. The stored flag is the desktop's alone.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => isDrawerViewport() || localStorage.getItem("miel.sidebar.collapsed") === "1",
  );
  // The app's one scrolling element, `AppContent`. Nothing above it scrolls,
  // so returning from a message — or from a delete that leaves one — comes
  // back to the offset the list was left at (#95). Held as state through a
  // callback ref rather than a ref object: the top bar renders before the
  // region and needs a re-render once there is a node to watch.
  const [contentNode, setContentNode] = useState<HTMLElement | null>(null);
  useScrollRestoration(contentNode);
  // The slot inside the bar that pages portal their controls into — see the
  // note where it is rendered for why it is a slot and not the bar itself.
  const [barNode, setBarNode] = useState<HTMLElement | null>(null);
  const onToggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      if (!isDrawerViewport()) localStorage.setItem("miel.sidebar.collapsed", next ? "1" : "0");
      return next;
    });
  }, []);
  useEffect(() => {
    if (isDrawerViewport()) setSidebarCollapsed(true);
  }, [locationKey]);

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
      setViewMode,
      selectedAccountEmail: selectedAccount?.email,
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
      setViewMode,
      selectedAccount?.email,
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
      <AppShell>
        <Sidebar
          selectedAccountId={selectedAccountId}
          selectedLabelId={selectedLabelId}
          onSelectLabel={handleSelectLabel}
          collapsed={sidebarCollapsed}
          onToggle={onToggleSidebar}
        />
        <AppMain>
          {/* The bar is the layout's; each page fills it through `PageTopBar`.
              Its one child here is the slot that content portals into, and it
              exists so the collapsed sidebar's open button — which the bar
              renders ahead of its children — stays leftmost. A portal appends
              to its container, so portalling into the `<header>` put the page's
              controls wherever the DOM happened to be when they mounted: with
              the sidebar open there is no trigger yet, and collapsing later
              appended it *after* them, at the far right. A slot pins the order.
              `display: contents` so `TopBarStart`/`TopBarEnd` stay flex items
              of the bar itself — their `ml-auto` and the centred period nav's
              absolute positioning both resolve against the header.

              The wider gap is the trigger's alone: the bar's default `gap-2`
              leaves two round controls (the open button, the account
              switcher's avatar) reading as one clump, and the switcher's own
              `-ml-1.5` — which aligns its avatar with the content below when
              the trigger is absent — closes the rest of it. */}
          <TopBar
            collapsed={sidebarCollapsed}
            onToggle={onToggleSidebar}
            scrollNode={contentNode}
            className={sidebarCollapsed ? "gap-4" : undefined}
          >
            <div ref={setBarNode} className="contents" />
          </TopBar>
          <AppContent ref={setContentNode} className="flex flex-col overflow-x-hidden">
            <TopBarNodeProvider value={barNode}>
              <Outlet context={outletContext} />
            </TopBarNodeProvider>
          </AppContent>
        </AppMain>
      </AppShell>
    </TriageActivityProvider>
  );
};
