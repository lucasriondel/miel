/**
 * Elements that can hold keyboard focus inside a dialog. Deliberately excludes
 * `tabindex="-1"` (programmatic-only targets, like the dialog panel itself) and
 * anything disabled or explicitly hidden from the tab order.
 */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Where a Tab keypress should land inside a focus trap.
 *
 * `currentIndex` is the position of the currently focused element within the
 * dialog's focusables, or `-1` when focus sits outside the dialog entirely
 * (the browser moved it to the address bar, or a stray programmatic focus).
 * The trap always answers with an explicit index rather than deferring to the
 * browser mid-list, so focus can never walk out of the dialog.
 *
 * Returns `null` when there is nothing focusable to move to.
 */
export function nextTrapFocusIndex(
  count: number,
  currentIndex: number,
  shiftKey: boolean,
): number | null {
  if (count <= 0) return null;
  if (currentIndex < 0) return shiftKey ? count - 1 : 0;
  return shiftKey ? (currentIndex - 1 + count) % count : (currentIndex + 1) % count;
}
