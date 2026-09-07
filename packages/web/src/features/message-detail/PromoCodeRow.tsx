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
 * An offer with no code is shown all the same: "free shipping over £40" is a
 * promo with nothing to copy, and dropping it would hide a real answer for want
 * of a button.
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
    {promo.code === null ? (
      <span className="shrink-0 text-xs font-medium text-gousse-muted">No code needed</span>
    ) : (
      <CopyPromoCodeButton code={promo.code} />
    )}
  </div>
);
