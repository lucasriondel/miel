import type { PromoListing } from "../../api/types";
import { CopyPromoCodeButton } from "./CopyPromoCodeButton";
import { promoExpiryDate } from "./promoExpiryLabel";
import { SavePromoButton } from "./SavePromoButton";

interface Props {
  promo: PromoListing;
}

/** A field the mail never stated, in a table that has to fill the cell anyway. */
const UNSTATED = "—";

/**
 * One detection nobody has acted on, as a row of the page's top section (#154).
 *
 * It shares the saved rows' columns on purpose: the five guesses and the mailbox
 * are what a row of this table says whichever state the promo is in, so the
 * reader's eye does not have to relearn the table halfway down. What differs is
 * what the row *does*, and here that is one thing — the same save the card above
 * the inbox offers, which writes the promo with its copy of the mail and then
 * trashes the Gmail original.
 *
 * None of the other three controls belongs here, and each absence is a rule
 * rather than an omission. There is no mail to view: the copy is written at save
 * time and at no other moment, and the Gmail original is still in the inbox for
 * anyone who wants it. There is nothing to correct: the guesses become
 * corrigible when the user decides to keep them, and an editor on a row that may
 * never be saved would be an edit with nowhere to land. And there is nothing to
 * delete: removing a detection would be a *dismissal*, a different act with a
 * different meaning that this feature does not have.
 *
 * Copying, on the other hand, is here — it changes nothing anywhere, and a user
 * standing at a checkout should not have to save a promo in order to try its
 * code.
 */
export const SuggestedPromoRow = ({ promo }: Props) => (
  <tr className="border-t border-gousse-line align-top">
    <td className="px-3 py-2 font-semibold text-gousse-ink">{promo.merchant ?? UNSTATED}</td>
    <td className="px-3 py-2 text-gousse-ink">{promo.discount}</td>
    <td className="px-3 py-2">
      {/* A row with no code is one an older build left behind, before #166
          stopped storing code-less offers. It gets the table's dash and no
          explanation, the way the saved row beside it does (#168) — and no
          copy act, because there is nothing to take. */}
      {promo.code ? (
        <CopyPromoCodeButton code={promo.code} />
      ) : (
        <span className="text-gousse-muted">{UNSTATED}</span>
      )}
    </td>
    <td className="px-3 py-2 text-gousse-muted">{promo.terms ?? UNSTATED}</td>
    <td className="whitespace-nowrap px-3 py-2 text-gousse-muted">
      {promoExpiryDate(promo.expiresAt)}
    </td>
    <td className="px-3 py-2 text-gousse-muted">{promo.accountEmail}</td>
    <td className="px-3 py-2">
      <div className="flex items-center justify-end">
        <SavePromoButton promo={promo} />
      </div>
    </td>
  </tr>
);
