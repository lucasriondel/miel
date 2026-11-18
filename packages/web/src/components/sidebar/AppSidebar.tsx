import { PanelLeft } from "lucide-react";
import type { Account } from "../../api/types";
import { cn } from "@/lib/utils";
import { LabelList } from "../LabelList";
import { ComposeButton } from "./ComposeButton";
import { SidebarAccountSwitcher } from "./SidebarAccountSwitcher";
import { SidebarFooterLinks } from "./SidebarFooterLinks";
import { SidebarMailboxNav, type SidebarMailboxNavProps } from "./SidebarMailboxNav";
import { SidebarRailContext } from "./SidebarRailContext";
import { SidebarSyncStatus } from "./SidebarSyncStatus";

interface Props extends SidebarMailboxNavProps {
  account: Account | undefined;
  selectedLabelId: string | undefined;
  onSelectLabel: (id: string | undefined) => void;
  onSelectAccount: (id: string) => void;
  onCompose: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * miel's sidebar, as the redesign draws it: the mailbox switcher, Compose, the
 * views (Inbox, Done, Promo codes), the account's labels, then Settings and the
 * sync status at the foot — on the cool `--gousse-fill` ground, with a hairline
 * against the content.
 *
 * Collapsed, it is a 72px rail of the same things as icons (desktop), or gone
 * (below `sm`, where open means a drawer over the page with a scrim behind).
 * The flag is the layout's; this file only draws the two shapes.
 */
export const AppSidebar = ({
  account,
  selectedLabelId,
  onSelectLabel,
  onSelectAccount,
  onCompose,
  collapsed,
  onToggle,
  ...nav
}: Props) => (
  <SidebarRailContext.Provider value={collapsed}>
    <button
      type="button"
      onClick={onToggle}
      aria-label="Close sidebar"
      tabIndex={collapsed ? -1 : 0}
      className={cn(
        "fixed inset-0 z-[55] bg-gousse-ink/40 transition-opacity duration-300 sm:hidden",
        collapsed ? "pointer-events-none opacity-0" : "opacity-100",
      )}
    />
    <aside
      data-collapsed={collapsed || undefined}
      className={cn(
        "fixed inset-y-0 left-0 z-[60] flex shrink-0 flex-col border-r border-gousse-line bg-gousse-fill py-4",
        "transition-[width,transform] duration-300 ease-out motion-reduce:transition-none",
        "sm:static sm:z-auto sm:translate-x-0",
        collapsed
          ? "w-[236px] -translate-x-full items-center gap-2 px-0 sm:w-[72px]"
          : "w-[236px] translate-x-0 gap-0.5 px-3",
      )}
    >
      <div
        className={cn(
          "flex h-7 shrink-0 items-center",
          collapsed ? "justify-center" : "justify-end px-1",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="grid h-7 w-7 place-items-center rounded-md text-gousse-muted transition-colors hover:bg-gousse-primary/5 hover:text-gousse-ink"
        >
          <PanelLeft className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className={collapsed ? "h-1.5" : "h-3"} />
      <SidebarAccountSwitcher selectedAccountId={account?.id} onSelectAccount={onSelectAccount} />
      <div className={collapsed ? "h-0" : "h-2"} />
      <ComposeButton onCompose={onCompose} />
      <div className={collapsed ? "h-2" : "h-[18px]"} />
      <SidebarMailboxNav {...nav} />
      {collapsed ? (
        <div className="flex-1" />
      ) : (
        <div className="sidebar-scroll mt-[22px] min-h-0 flex-1 overflow-y-auto">
          <LabelList
            accountId={account?.id}
            selectedLabelId={selectedLabelId}
            onSelect={onSelectLabel}
          />
        </div>
      )}
      <SidebarFooterLinks accountId={account?.id} />
      <div className="h-2 shrink-0" />
      <SidebarSyncStatus account={account} />
    </aside>
  </SidebarRailContext.Provider>
);
