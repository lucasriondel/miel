import { useState } from "react";
import type { SavedPromo } from "../../api/types";
import { SavedPromoEditRow } from "./SavedPromoEditRow";
import { SavedPromoReadRow } from "./SavedPromoReadRow";

interface Props {
  promo: SavedPromo;
}

/**
 * One saved promo, in whichever of its two states it is in (#164).
 *
 * The flag is the row's own rather than the section's, which is the opposite of
 * the way a delete confirmation is usually armed one-at-a-time: correcting two
 * rows is two independent corrections, and closing the first because the second
 * was opened would throw away typing nobody asked to discard.
 *
 * Editing replaces the row rather than opening beside it, so the columns stay
 * aligned with every other row and each box sits under the heading that names
 * what it holds.
 */
export const SavedPromoRow = ({ promo }: Props) => {
  const [editing, setEditing] = useState(false);

  return editing ? (
    <SavedPromoEditRow promo={promo} onDone={() => setEditing(false)} />
  ) : (
    <SavedPromoReadRow promo={promo} onEdit={() => setEditing(true)} />
  );
};
