import type { Priority } from "../api/types";

/**
 * Priority → the classes that paint it (#140).
 *
 * The `--gousse-high|medium|low` tokens stay the single source for the colour
 * *values* (DESIGN.md §1), and they double as semantic danger/warning/success
 * elsewhere. What lives here is the other half: which token a triage verdict
 * takes, and how it is worn. Two surfaces state a priority — the inbox section
 * header and the detail view's triage row — and they spelled it out separately,
 * so recolouring priority meant finding both.
 *
 * Since #141 a priority is the colour of the words rather than a filled pill,
 * so the mapping names an `-ink` token: the fill taken down far enough to read
 * as text on `--gousse-bg` and `--gousse-panel` in the light theme, and the
 * fill itself on dark, where it already does (`index.css`). The word stays on
 * screen either way — colour is the emphasis, never the carrier.
 */
const INK: Record<Priority, string> = {
  high: "text-gousse-high-ink",
  medium: "text-gousse-medium-ink",
  low: "text-gousse-low-ink",
};

export const priorityInk = (priority: Priority): string => INK[priority];
