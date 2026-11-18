import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppSidebar } from "./components/sidebar/AppSidebar";
import type { SidebarPlace } from "./components/sidebar/SidebarMailboxNav";
import { useDateRange, type DateRange, type RangeMode } from "./features/sync/useDateRange";
import { useFocusSync } from "./features/sync/useFocusSync";
import { useAccounts, useAllMessages, useSuggestedPromos } from "./api/queries";
import { useScheduledSends } from "./api/scheduledSends.hooks";
import { snoozedListParams } from "./features/snooze/snoozedListParams";
import { useConnectResult } from "./hooks/useConnectResult";
import { OnboardingGate } from "./features/onboarding/OnboardingGate";
import { TriageActivityProvider } from "./contexts/TriageActivityContext";
import { useScrollRestoration } from "./hooks/useScrollRestoration";
import { ScrollRegionContext } from "./features/shell/scrollRegion";
import { SidebarToggleContext } from "./features/shell/sidebarToggle";
import { ComposeProvider, useCompose } from "./features/compose/ComposeProvider";
import { inboxSearch } from "./features/inbox/inboxLocation";
import { mailboxFromSearch, type Mailbox } from "./features/inbox/mailbox";
import { isTypingTarget } from "./features/shell/isTypingTarget";
import {
  readDefaultViewPreference,
  readLastAccountId,
  resolveDefaultAccount,
  writeLastAccountId,
} from "./features/preferences/defaultView";

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
  /** Which list the inbox page shows: the inbox, Done (Gmail's archive) or Snoozed. */
  mailbox: Mailbox;
}

/** Tailwind's `sm` breakpoint, below which `SidebarShell` renders as a drawer. */
const DRAWER_VIEWPORT = "(max-width: 639px)";
const isDrawerViewport = () => window.matchMedia(DRAWER_VIEWPORT).matches;

export const App = () => (
  <ComposeProvider>
    <AppLayout />
  </ComposeProvider>
);

const AppLayout = () => {
  const accounts = useAccounts();
  const { accountId: routeAccountId } = useParams<{ accountId?: string }>();
  const navigate = useNavigate();
  const { pathname, search, key: locationKey } = useLocation();
  const compose = useCompose();
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
  // The page's scrolling body, which each page's `PageLayout` hands up through
  // `ScrollRegionContext`: returning from a message — or from a delete that
  // leaves one — comes back to the offset the list was left at (#95). State,
  // not a ref, so restoration re-binds when a page swaps its body.
  const [contentNode, setContentNode] = useState<HTMLElement | null>(null);
  useScrollRestoration(contentNode);
  const mailbox = mailboxFromSearch(search);
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

  // The route names the account when it can. When it doesn't, `/` opens on the
  // browser's default view (a pinned account, or the last one looked at), and a
  // standalone page keeps whatever account was already selected — visiting
  // Settings must not quietly switch mailboxes.
  useEffect(() => {
    const list = accounts.data;
    if (!list || list.length === 0) return;
    const current = list.find((a) => a.id === selectedAccountId);
    const target = routeAccountId
      ? list.find((a) => a.id === routeAccountId)
      : !isAccountScope && current
        ? current
        : resolveDefaultAccount(list, readDefaultViewPreference(), readLastAccountId());
    if (!target) return;
    if (selectedAccountId !== target.id) setSelectedAccountId(target.id);
    if (routeAccountId) writeLastAccountId(target.id);
    else if (isAccountScope) navigate(`/account/${target.id}`, { replace: true });
  }, [accounts.data, routeAccountId, selectedAccountId, navigate, isAccountScope]);

  useEffect(() => {
    const labelFromUrl = params.get("label");
    if (labelFromUrl !== null) {
      setSelectedLabelId(labelFromUrl || undefined);
    }
  }, [params]);

  const selectedAccount = accounts.data?.find((a) => a.id === selectedAccountId);

  useFocusSync(selectedAccount?.email);

  // The sidebar's two counts: unread mail in the period on screen (the same
  // read the inbox makes, so it costs nothing extra while no label is picked)
  // and the promo codes waiting to be reviewed.
  const periodMessages = useAllMessages({
    accountId: selectedAccountId,
    internalDateFrom: range.start.toISOString(),
    internalDateTo: range.end.toISOString(),
  });
  const inboxCount = periodMessages.items.filter((m) =>
    m.labels.some((l) => l.name === "UNREAD"),
  ).length;
  const promoCount = useSuggestedPromos().data?.items.length;
  // Snoozed counts every snoozed thread of the account, not the period's — the
  // same read the Snoozed view makes, so opening it costs nothing more.
  const snoozedCount = useAllMessages(snoozedListParams(selectedAccountId)).items.length;
  // Mail waiting to go, or that failed to: the Scheduled row exists only while
  // there is some, so this count is also whether it is drawn.
  const scheduledCount = useScheduledSends(selectedAccountId).data?.items.length ?? 0;

  // `C` opens a new message from the mailbox on screen — unless the keystroke
  // is someone typing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key !== "c" && e.key !== "C") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      compose.openNew(selectedAccountId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [compose, selectedAccountId]);

  // Shift+U cycles accounts. It only navigates: the effect above derives
  // `selectedAccountId` from the route, and setting the state here as well ran
  // ahead of the URL — that effect then saw the old route and put the old
  // account back for a render before the navigation landed, a visible A→B→A→B.
  // A held key is ignored, or auto-repeat would spin through every account.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.shiftKey && e.code === "KeyU" && accounts.data && accounts.data.length > 0) {
        e.preventDefault();
        const currentIndex = accounts.data.findIndex((a) => a.id === selectedAccountId);
        const nextIndex = (currentIndex + 1) % accounts.data.length;
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
      mailbox,
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
      mailbox,
    ],
  );

  // Picking a label filters the inbox (not Done) and keeps the period.
  const handleSelectLabel = useCallback(
    (id: string | undefined) => {
      setSelectedLabelId(id);
      if (!selectedAccountId) return;
      navigate(
        `/account/${selectedAccountId}${scopedSearch(search, { label: id ?? null, mailbox: null })}`,
      );
    },
    [selectedAccountId, navigate, search],
  );

  const handleSelectAccount = useCallback(
    (id: string) => navigate(`/account/${id}`, { replace: true }),
    [navigate],
  );

  const accountScope = selectedAccountId ? `/account/${selectedAccountId}` : undefined;
  const current: SidebarPlace = pathname.startsWith("/promo-codes")
    ? "promo-codes"
    : pathname.startsWith("/settings")
      ? "settings"
      : pathname.startsWith("/logs")
        ? "logs"
        : pathname.endsWith("/filters")
          ? "filters"
          : pathname.endsWith("/scheduled")
            ? "scheduled"
            : mailbox === "done"
              ? "done"
              : mailbox === "snoozed"
                ? "snoozed"
                : selectedLabelId
                  ? null
                  : "inbox";

  return (
    <TriageActivityProvider>
      {/* Mounted on the layout, so the gate covers every route below it. */}
      <OnboardingGate error={gateError} onRetry={clearGateError} />
      <SidebarToggleContext.Provider value={sidebarCollapsed ? onToggleSidebar : undefined}>
        <div className="flex h-screen w-full overflow-hidden bg-gousse-bg text-gousse-ink">
          <AppSidebar
            account={selectedAccount}
            selectedLabelId={selectedLabelId}
            onSelectLabel={handleSelectLabel}
            onSelectAccount={handleSelectAccount}
            onCompose={() => compose.openNew(selectedAccountId)}
            collapsed={sidebarCollapsed}
            onToggle={onToggleSidebar}
            inboxHref={
              accountScope
                ? `${accountScope}${scopedSearch(search, { label: null, mailbox: null })}`
                : undefined
            }
            doneHref={
              accountScope
                ? `${accountScope}${scopedSearch(search, { label: null, mailbox: "done" })}`
                : undefined
            }
            snoozedHref={
              accountScope
                ? `${accountScope}${scopedSearch(search, { label: null, mailbox: "snoozed" })}`
                : undefined
            }
            scheduledHref={
              // Kept while the page is open, so cancelling the last one does
              // not pull the row out from under the page showing it.
              accountScope && (scheduledCount > 0 || current === "scheduled")
                ? `${accountScope}/scheduled`
                : undefined
            }
            current={current}
            inboxCount={inboxCount}
            snoozedCount={snoozedCount}
            scheduledCount={scheduledCount}
            promoCount={promoCount}
          />
          {/* Each page draws its own header above its own scroll body; the
              layout only learns which node that body is, for restoration. */}
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <ScrollRegionContext.Provider value={setContentNode}>
              <Outlet context={outletContext} />
            </ScrollRegionContext.Provider>
          </main>
        </div>
      </SidebarToggleContext.Provider>
    </TriageActivityProvider>
  );
};

/**
 * The inbox's scope params from `search`, with `label` and `mailbox` set (or
 * cleared with `null`) — how the sidebar's links keep the period on screen.
 */
const scopedSearch = (
  search: string,
  patch: { label: string | null; mailbox: Mailbox | null },
): string => {
  const params = new URLSearchParams(inboxSearch(search));
  if (patch.label) params.set("label", patch.label);
  else params.delete("label");
  if (patch.mailbox && patch.mailbox !== "inbox") params.set("mailbox", patch.mailbox);
  else params.delete("mailbox");
  const query = params.toString();
  return query ? `?${query}` : "";
};
