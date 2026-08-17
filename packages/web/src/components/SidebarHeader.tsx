import { NavLink } from "react-router-dom";
import { assetUrl } from "../lib/basePath";
import { SidebarHeader as GousseSidebarHeader, SidebarClose } from "@/components/ui/sidebar";

interface Props {
  onToggle: () => void;
}

export const SidebarHeader = ({ onToggle }: Props) => (
  <GousseSidebarHeader>
    <NavLink
      to="/"
      className="flex items-center gap-3 text-lg font-bold tracking-tight text-gousse-accent transition-opacity hover:opacity-80"
    >
      <img src={assetUrl("/miel.webp")} alt="" className="h-9 w-9 shrink-0 rounded-md" />
      miel
    </NavLink>
    <SidebarClose onClick={onToggle} />
  </GousseSidebarHeader>
);
