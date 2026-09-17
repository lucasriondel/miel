import { CopyPromoCodeButton } from "../promos/CopyPromoCodeButton";
import { promoExpiryLabel } from "../promos/promoExpiryLabel";
import type { PromoSuggestion } from "../../api/types";

interface Props {
  promo: PromoSuggestion;
}

/**
 * One extracted promo, as the detail panel shows it (#165).
 *
 * The discount leads because it is the offer; the code sits beside it as the
 * one thing that is clickable, through the same chip the Promo Codes page uses
 * — a user reaching for a code aims at the code, wherever the code is drawn.
 *
 * A row with no code draws its context and simply no chip. Since #166 an offer
 * that needs no code never becomes a row — a run whose only offer was one
 * reports "found nothing" instead — so the only rows that reach it are the ones
 * written before that, which were not migrated. Tolerating them is the whole of
 * it: there is no longer a line saying the offer needs no code, because that is
 * not an answer this panel gives (#168).
 */
export const PromoCodeRow = ({ promo }: Props) => (
  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-sm font-semibold text-gousse-ink">{promo.discount}</span>
      {promo.terms ? (
        <span className="text-xs leading-relaxed text-gousse-muted">{promo.terms}</span>
      ) : null}
      <span className="text-xs text-gousse-muted opacity-75">
        {promo.merchant ? `${promo.merchant} · ` : ""}
        {promoExpiryLabel(promo.expiresAt)}
      </span>
    </div>
    {promo.code === null ? null : <CopyPromoCodeButton code={promo.code} />}
  </div>
);
