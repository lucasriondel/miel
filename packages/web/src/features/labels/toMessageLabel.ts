import type { Label, MessageLabel } from "../../api/types";

/**
 * The account's label as a message carries it.
 *
 * The picker hands back a `Label` — the catalogue row, with its account and its
 * type on it — while the optimistic badge is a `MessageLabel`, the five fields a
 * row and a detail draw. Structurally the first satisfies the second, so this
 * would compile without being written; it exists so the extra columns are not
 * copied into every cached message the mutation touches.
 */
export function toMessageLabel(label: Label): MessageLabel {
  return {
    id: label.id,
    name: label.name,
    gmailLabelId: label.gmailLabelId,
    colorBg: label.colorBg,
    colorFg: label.colorFg,
  };
}
