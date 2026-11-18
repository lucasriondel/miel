import { Pencil } from "lucide-react";
import type { PromoListing } from "../../api/types";
import { iconButtonClass, iconButtonIconClass } from "../../components/iconButton";
import { CopyPromoCodeButton } from "./CopyPromoCodeButton";
import { DeletePromoButton } from "./DeletePromoButton";
import { SavePromoButton } from "./SavePromoButton";

interface Props {
  promo: PromoListing;
  /** Filed under Active or Expired, rather than To review. */
  saved: boolean;
  editing: boolean;
  onEdit: () => void;
}

/**
 * What can be done to the open promo. A saved one is corrected, copied and
 * deleted; a suggestion is copied and saved — it has no editor (its guesses
 * become corrigible once kept) and no delete (removing a detection would be a
 * dismissal, which this feature does not have).
 */
export const PromoReaderToolbar = ({ promo, saved, editing, onEdit }: Props) => (
  <div className="flex items-center gap-1">
    {saved ? (
      <button
        type="button"
        aria-label="Edit promo code"
        title="Edit promo code"
        onClick={onEdit}
        disabled={editing}
        className={iconButtonClass()}
      >
        <Pencil className={iconButtonIconClass()} aria-hidden />
      </button>
    ) : null}
    {promo.code ? <CopyPromoCodeButton code={promo.code} variant="icon" /> : null}
    <span aria-hidden className="mx-1.5 h-[18px] w-px bg-gousse-line" />
    {saved ? <DeletePromoButton promoId={promo.id} /> : <SavePromoButton promo={promo} />}
  </div>
);
