import type { PromoListing } from "../../api/types";
import { cn } from "../../lib/utils";
import { CopyPromoCodeButton } from "./CopyPromoCodeButton";
import { DeletePromoButton } from "./DeletePromoButton";
import { OpenPromoButton } from "./OpenPromoButton";
import { PromoExpiryPill } from "./PromoExpiryPill";
import { PromoMonogram } from "./PromoMonogram";
import { promoMerchant } from "./promoPresentation";

interface Props {
  promo: PromoListing;
  now: Date;
  selected: boolean;
  onSelect: () => void;
  /** The lapsed half: greyed, never dropped. */
  faded?: boolean;
  /** Whether the page spans more than one mailbox, so which one is worth saying. */
  showAccount: boolean;
}

/** A field the mail never stated, in a row that has to fill the slot anyway. */
const UNSTATED = "—";

/**
 * One saved promo as a row of the Active or Expired list (#162–#164): the shop
 * and the offer, the terms, the code, the deadline and the delete. Opening the
 * row puts the promo in the reader, which is where its mail is read and its
 * guesses are corrected.
 *
 * The mailbox it arrived in is said on the second line when the page spans more
 * than one — information, never a gate; with one mailbox it would say the same
 * thing on every row, and the reader says it either way.
 *
 * A row whose code is null is one written before #166 stopped storing one, and
 * it is drawn like any other field the mail never stated — the same dash, no
 * copy affordance and no sentence about offers that need no code (#168). The
 * save trashed the Gmail original, so the row is very often the only surviving
 * copy of that mail and nothing here may drop it.
 */
export const SavedPromoRow = ({ promo, now, selected, onSelect, faded, showAccount }: Props) => {
  const merchant = promoMerchant(promo);
  const detail = [promo.terms ?? UNSTATED, showAccount ? promo.accountEmail : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      aria-label={`${merchant ?? "Promo"} ${promo.discount}`}
      className={cn(
        "relative flex min-h-16 items-center gap-4 border-b border-gousse-fill py-3 pr-3 pl-4 transition-colors last:border-b-0",
        selected ? "bg-gousse-field-hover" : "hover:bg-gousse-hover",
      )}
    >
      <OpenPromoButton
        label={`Open ${merchant ?? "promo"} ${promo.discount}`}
        selected={selected}
        onOpen={onSelect}
      />
      <PromoMonogram name={merchant} size={32} muted={faded} plain={selected && !faded} />
      <div className={cn("flex min-w-0 flex-1 flex-col gap-[3px]", faded && "opacity-70")}>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="max-w-[60%] shrink-0 truncate text-sm font-semibold text-gousse-ink">
            {merchant ?? UNSTATED}
          </span>
          <span className="min-w-0 truncate text-sm font-medium text-gousse-body">
            {promo.discount}
          </span>
        </div>
        <span className="truncate text-xs text-gousse-muted">{detail}</span>
      </div>
      <div
        className={cn(
          "relative z-10 hidden w-[160px] shrink-0 @xl:block @3xl:w-[200px]",
          faded && "opacity-70",
        )}
      >
        {promo.code ? (
          <CopyPromoCodeButton
            code={promo.code}
            variant="field"
            className={selected ? "bg-gousse-panel" : undefined}
          />
        ) : (
          <span className="flex h-8 items-center px-3 text-xs text-gousse-muted">{UNSTATED}</span>
        )}
      </div>
      <div className="hidden w-[120px] shrink-0 @lg:flex">
        <PromoExpiryPill expiresAt={promo.expiresAt} now={now} />
      </div>
      <div className="relative z-10 flex shrink-0 items-center">
        <DeletePromoButton promoId={promo.id} />
      </div>
    </li>
  );
};
