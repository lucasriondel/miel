import { createContext, useContext } from "react";

/**
 * Opens the sidebar while it is closed — what a page header's menu button calls
 * below `sm`, where the sidebar is a drawer and nothing else on screen can
 * bring it back. `undefined` while the sidebar is already open (or outside the
 * layout), which is the header's cue to draw no button at all.
 */
export const SidebarToggleContext = createContext<(() => void) | undefined>(undefined);

export const useSidebarToggle = () => useContext(SidebarToggleContext);
