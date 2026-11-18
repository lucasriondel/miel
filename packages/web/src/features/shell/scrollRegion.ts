import { createContext, useContext } from "react";

/**
 * The page's scrolling region, published to the layout.
 *
 * The redesign has no shared top bar: each page draws its own header above its
 * own scroll body (and the inbox draws two columns, each scrolling on its own).
 * So the layout no longer owns the one scrolling element — the page does — and
 * this is how the layout still learns which node it is, for scroll restoration
 * (#95). `PageLayout` calls the setter with its body; nothing else should.
 *
 * The default is a no-op, so a page mounted alone in a test needs no provider.
 */
export const ScrollRegionContext = createContext<(node: HTMLElement | null) => void>(() => {});

export const useScrollRegionRef = () => useContext(ScrollRegionContext);
