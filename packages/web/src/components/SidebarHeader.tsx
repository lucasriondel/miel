import { Link } from "react-router-dom";
import { assetUrl } from "../lib/basePath";
import {
  SidebarHeader as GousseSidebarHeader,
  SidebarTitle,
  SidebarClose,
} from "@/components/ui/sidebar";

interface Props {
  onToggle: () => void;
}

/**
 * The brand row: gousse's `SidebarTitle` rendered as a router link to the app
 * root, with the honey mark in its slot. The title's `render` prop is the whole
 * of the router wiring, as `SidebarNavLink` is for the rows.
 *
 * The collapse button trails the title, where the registry's `justify-between`
 * header puts it: the sidebar's toggle sits at the panel's right edge and the
 * top bar's open button at the content column's left edge, so the two stay
 * adjacent across the seam whichever state the sidebar is in.
 */
export const SidebarHeader = ({ onToggle }: Props) => (
  <GousseSidebarHeader className="gap-3 sm:pl-6">
    <SidebarTitle
      mark={<img src={assetUrl("/miel.webp")} alt="" className="h-full w-full object-cover" />}
      render={(p) => <Link to="/" {...p} />}
    >
      miel
    </SidebarTitle>
    <SidebarClose onClick={onToggle} />
  </GousseSidebarHeader>
);
