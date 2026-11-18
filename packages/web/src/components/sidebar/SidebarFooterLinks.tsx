import { Filter, ScrollText, Settings } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useSidebarRail } from "./SidebarRailContext";
import { SidebarNavItem } from "./SidebarNavItem";

/**
 * Settings at the foot of the sidebar, with the two pages the design leaves
 * out — Filters and Logs — beside it rather than dropped: both still exist and
 * are still reached from here, just below the places a day is spent in.
 */
export const SidebarFooterLinks = ({ accountId }: { accountId: string | undefined }) => {
  const rail = useSidebarRail();
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="App"
      className={rail ? "flex flex-col items-center gap-1" : "flex flex-col gap-0.5 pt-2"}
    >
      {accountId ? (
        <SidebarNavItem
          to={`/account/${accountId}/filters`}
          icon={<Filter aria-hidden />}
          label="Filters"
          active={pathname.endsWith("/filters")}
        />
      ) : null}
      <SidebarNavItem
        to="/logs"
        icon={<ScrollText aria-hidden />}
        label="Logs"
        active={pathname === "/logs"}
      />
      <SidebarNavItem
        to="/settings"
        icon={<Settings aria-hidden />}
        label="Settings"
        active={pathname === "/settings"}
      />
    </nav>
  );
};
