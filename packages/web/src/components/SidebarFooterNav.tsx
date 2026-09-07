import { ScrollText, Settings as SettingsIcon } from "lucide-react";
import { SidebarNavLink } from "./SidebarNavLink";
import { SidebarFooter } from "@/components/ui/sidebar";

export const SidebarFooterNav = () => (
  <SidebarFooter>
    <SidebarNavLink to="/logs" icon={<ScrollText aria-hidden className="sidebar-glyph h-4 w-4" />}>
      Logs
    </SidebarNavLink>
    <SidebarNavLink
      to="/settings"
      icon={<SettingsIcon aria-hidden className="sidebar-glyph h-4 w-4" />}
    >
      Settings
    </SidebarNavLink>
  </SidebarFooter>
);
