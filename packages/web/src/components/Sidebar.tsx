import { LabelList } from "./LabelList";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarFooterNav } from "./SidebarFooterNav";
import { SidebarShell, SidebarContent } from "@/components/ui/sidebar";

interface Props {
  selectedAccountId: string | undefined;
  selectedLabelId: string | undefined;
  onSelectLabel: (id: string | undefined) => void;
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * miel's sidebar: the gousse `SidebarShell` filled with our label list. The
 * shell owns the responsive behaviour — mobile drawer + scrim, desktop
 * width-collapse, `inert` while closed — so this file is only composition.
 */
export const Sidebar = ({
  selectedAccountId,
  selectedLabelId,
  onSelectLabel,
  collapsed,
  onToggle,
}: Props) => (
  <SidebarShell collapsed={collapsed} onToggle={onToggle}>
    <SidebarHeader onToggle={onToggle} />

    <SidebarContent>
      <LabelList
        accountId={selectedAccountId}
        selectedLabelId={selectedLabelId}
        onSelect={onSelectLabel}
      />
    </SidebarContent>

    <SidebarFooterNav />
  </SidebarShell>
);
