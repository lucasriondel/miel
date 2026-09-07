import { Pencil } from "lucide-react";
import type { SavedPromo } from "../../api/types";
import { CopyPromoCodeButton } from "./CopyPromoCodeButton";
import { DeletePromoButton } from "./DeletePromoButton";
import { promoExpiryDate } from "./promoExpiryLabel";
import { ViewOriginalMailButton } from "./ViewOriginalMailButton";

interface Props {
  promo: SavedPromo;
  onEdit: () => void;
}

/** A field the mail never stated, in a table that has to fill the cell anyway. */
const UNSTATED = "—";

/**
 * One saved promo as it is read (#162, #163, #164).
 *
 * The account is the last column before the controls on purpose: it is
 * information, not a way in. The page is global because a promo code is used at
 * a checkout, so which mailbox it arrived in is the least of what the row says —
 * but it is said, because a code that turns out to be for the wrong shop is
 * answered by knowing where it came from.
 *
 * Four things a row does, and only one of them changes the promo. Taking the
 * code and reading the mail leave it exactly as it was; correcting the guesses
 * is the edit, and removing it is the delete. Which of the four is missing on a
 * given row is what the mail did not say: an offer needing no code has nothing
 * to copy.
 */
export const SavedPromoReadRow = ({ promo, onEdit }: Props) => (
  <tr className="border-t border-gousse-line align-top">
    <td className="px-3 py-2 font-semibold text-gousse-ink">{promo.merchant ?? UNSTATED}</td>
    <td className="px-3 py-2 text-gousse-ink">{promo.discount}</td>
    <td className="px-3 py-2">
      {promo.code ? (
        <CopyPromoCodeButton code={promo.code} />
      ) : (
        // Not an empty cell, and nothing to copy: "no code needed" is something
        // the mail said.
        <span className="text-gousse-muted">No code needed</span>
      )}
    </td>
    <td className="px-3 py-2 text-gousse-muted">{promo.terms ?? UNSTATED}</td>
    <td className="whitespace-nowrap px-3 py-2 text-gousse-muted">
      {promoExpiryDate(promo.expiresAt)}
    </td>
    <td className="px-3 py-2 text-gousse-muted">{promo.accountEmail}</td>
    <td className="px-3 py-2">
      <div className="flex items-center justify-end gap-1">
        <ViewOriginalMailButton promoId={promo.id} />
        <button
          type="button"
          aria-label="Edit promo code"
          title="Edit promo code"
          onClick={onEdit}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gousse-muted transition-[transform,background-color,color] hover:bg-gousse-ink/10 hover:text-gousse-ink active:scale-[0.96]"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
        <DeletePromoButton promoId={promo.id} />
      </div>
    </td>
  </tr>
);
