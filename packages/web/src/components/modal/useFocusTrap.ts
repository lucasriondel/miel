import { useEffect, type RefObject } from "react";
import { FOCUSABLE_SELECTOR, nextTrapFocusIndex } from "./focusTrap";

function focusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Keeps keyboard focus inside `panelRef` while `active`.
 *
 * On activation focus moves to the first focusable control (the panel itself as
 * a fallback, which is why it must carry `tabIndex={-1}`), and on deactivation
 * it returns to whatever was focused before — so dismissing a dialog doesn't
 * dump the user back at the top of the document.
 *
 * Tab is handled explicitly rather than left to the browser: every keypress is
 * routed through {@link nextTrapFocusIndex}, so the wrap at either end is ours
 * and focus can't step out into the page behind. A `focusin` guard covers the
 * ways focus can move without a Tab (a click on the backdrop, a stray
 * programmatic `focus()`).
 */
export function useFocusTrap(panelRef: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const panel = panelRef.current;
    if (!active || !panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // The panel is the fallback for a dialog with nothing focusable in it.
    const focusFirst = () => (focusables(panel)[0] ?? panel).focus();
    focusFirst();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      const items = focusables(panel);
      const next = nextTrapFocusIndex(
        items.length,
        items.indexOf(document.activeElement as HTMLElement),
        e.shiftKey,
      );
      if (next === null) panel.focus();
      else items[next].focus();
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Node | null;
      if (target && panel.contains(target)) return;
      focusFirst();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      previouslyFocused?.focus();
    };
  }, [panelRef, active]);
}
