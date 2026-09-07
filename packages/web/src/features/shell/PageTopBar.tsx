import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The layout owns the top bar — it sits above the scroll region, outside the
 * `Outlet` — but what goes *in* it is each page's business: the inbox puts the
 * account switcher and sync there, a message its actions and Reply. So a page
 * declares its bar content in place and this portals it into the `<header>`
 * the layout rendered.
 *
 * A portal, not a context setter: portalled children are real DOM children of
 * the bar, so its flex row lays them out and its `group/bar` scroll state
 * reaches them, and they appear on the same render as the page rather than one
 * effect later.
 *
 * Three values, not two. `undefined` is the default — no layout above, which is
 * a page mounted alone in a test — and the content renders in place so a suite
 * still sees the controls it would in the app. `null` is a layout whose bar
 * has not attached yet (the ref lands one commit after the first render), and
 * then nothing renders: painting the bar's controls inside the content for one
 * frame would be a flash, not a fallback.
 */
const TopBarNodeContext = createContext<HTMLElement | null | undefined>(undefined);

export const TopBarNodeProvider = TopBarNodeContext.Provider;

/** A page's contribution to the bar. */
export const PageTopBar = ({ children }: { children: ReactNode }) => {
  const node = useContext(TopBarNodeContext);
  if (node === undefined) return <>{children}</>;
  return node ? createPortal(children, node) : null;
};
