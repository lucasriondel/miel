import { createContext, useContext } from "react";

/**
 * Whether the sidebar is drawn as the collapsed rail (icons only).
 *
 * The rail is a desktop state — `sm` and up. Below that the sidebar is a drawer
 * that is either fully open or gone, so the drawer always renders the full rows
 * and passes `false` here.
 */
export const SidebarRailContext = createContext(false);

export const useSidebarRail = () => useContext(SidebarRailContext);
