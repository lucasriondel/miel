import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { SidebarItem } from "@/components/ui/sidebar";

interface Props {
  to: string;
  icon?: ReactNode;
  children: ReactNode;
}

/**
 * Route-driven sidebar row — the router adapter for the gousse `SidebarItem`.
 * Active state comes from the router rather than a prop: `NavLink` sets
 * `aria-current="page"`, which `.sidebar-row` keys its active rules off just as
 * it does `data-active`. This file is the only place the sidebar meets
 * react-router, which is why the registry primitive stays router-agnostic.
 */
export const SidebarNavLink = ({ to, icon, children }: Props) => (
  <SidebarItem icon={icon} render={(props) => <NavLink to={to} {...props} />}>
    <span className="truncate">{children}</span>
  </SidebarItem>
);
