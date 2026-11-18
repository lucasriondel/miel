/**
 * Whether a keystroke landed somewhere the user is typing — a field, a text
 * area, anything editable — so single-letter shortcuts stay out of the way.
 */
export const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};
