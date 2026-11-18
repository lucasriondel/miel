import type { PromoListing } from "../../api/types";
import { cn } from "../../lib/utils";
import { CopyPromoCodeButton } from "./CopyPromoCodeButton";
import { OpenPromoButton } from "./OpenPromoButton";
import { PromoMonogram } from "./PromoMonogram";
import { promoExpiryState } from "./promoExpiryLabel";
import { promoMerchant } from "./promoPresentation";
import { mailDayLabel } from "./promoDates";
import { SavePromoButton } from "./SavePromoButton";

interface Props {
  promo: PromoListing;
  now: Date;
  selected: boolean;
  onSelect: () => void;
  /** Whether the page spans more than one mailbox, so which one is worth saying. */
  showAccount: boolean;
}

const UNSTATED = "—";

/**
 * One detection nobody has acted on, as a card of the page's "To review" row
 * (#154): who sent it and when, the offer, the code and its deadline, and the
 * one act it offers — the same save the inbox chip makes, which writes the
 * promo with its copy of the mail and then trashes the Gmail original.
 *
 * The design draws a trash icon beside Save; it is deliberately not here.
 * Removing a detection would be a *dismissal*, a different act with a different
 * meaning that this feature does not have. Nor is there an editor: the guesses
 * become corrigible when the user decides to keep them. Copying is here — it
 * changes nothing anywhere, and trying a code must not cost a save.
 */
export const SuggestionCard = ({ promo, now, selected, onSelect, showAccount }: Props) => {
  const merchant = promoMerchant(promo);
  const expiry = promoExpiryState(promo.expiresAt, now);
  const mailLine = [promo.subject, mailDayLabel(promo.internalDate, now)]
    .filter(Boolean)
    .join(" · ");
  const footer = [expiry.label, promo.terms].filter(Boolean).join(" · ");

  return (
    <article
      aria-label={`${merchant ?? "Promo"} ${promo.discount}`}
      className={cn(
        "relative flex min-w-0 flex-col gap-3 rounded-xl border border-gousse-medium/25 bg-gousse-panel p-4 shadow-gousse-sm transition-shadow hover:shadow-gousse-md",
        selected && "ring-2 ring-gousse-primary/25",
      )}
    >
      <OpenPromoButton
        label={`Open ${merchant ?? "promo"} ${promo.discount}`}
        selected={selected}
        onOpen={onSelect}
      />
      <div className="flex min-w-0 items-center gap-2.5">
        <PromoMonogram name={merchant} size={28} />
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[13px] font-semibold text-gousse-ink">
            {merchant ?? UNSTATED}
          </span>
          <span className="truncate text-xs text-gousse-muted">
            {mailLine || (showAccount ? promo.accountEmail : UNSTATED)}
          </span>
        </div>
      </div>
      <p className="truncate text-xl font-bold text-gousse-ink">{promo.discount}</p>
      {/* A card with no code is one an older build left behind, before #166
          stopped storing code-less offers. It gets the dash every unstated
          field gets and no copy act, because there is nothing to take (#168). */}
      {promo.code ? (
        <CopyPromoCodeButton code={promo.code} variant="field" className="relative z-10 h-[34px]" />
      ) : (
        <span className="flex h-[34px] items-center px-3 text-xs text-gousse-muted">
          {UNSTATED}
        </span>
      )}
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-xs",
            expiry.tone === "soon" ? "text-gousse-tint-amber-ink" : "text-gousse-muted",
          )}
        >
          {footer}
          {showAccount && mailLine ? ` · ${promo.accountEmail}` : ""}
        </span>
        <SavePromoButton promo={promo} className="relative z-10" />
      </div>
    </article>
  );
};
