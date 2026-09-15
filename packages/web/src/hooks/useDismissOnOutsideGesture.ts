import { useEffect } from "react";

/**
 * Dismiss something a swipe just revealed on the next tap or scroll anywhere
 * else on the page.
 *
 * Shared by the two surfaces that reveal actions by swiping — a message row and
 * a category band's heading — because the one subtlety in it is easy to drop on
 * the second copy: the listeners are attached on a deferred tick. The gesture's
 * own `touchend` synthesizes a `pointerdown` on the element the finger left, so
 * binding synchronously would close the strip in the same frame it opened.
 *
 * `active` is the caller's whole contract: nothing is bound while it is false,
 * so a desktop surface that never reveals by swiping pays nothing.
 */
export function useDismissOnOutsideGesture(active: boolean, onDismiss: () => void): void {
  useEffect(() => {
    if (!active) return;
    const dismiss = () => onDismiss();
    const id = window.setTimeout(() => {
      document.addEventListener("pointerdown", dismiss);
      window.addEventListener("scroll", dismiss, { passive: true });
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("scroll", dismiss);
    };
  }, [active, onDismiss]);
}
