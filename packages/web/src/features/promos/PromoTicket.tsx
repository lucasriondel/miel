import type { PromoListing } from "../../api/types";
import { cn } from "../../lib/utils";
import { CopyPromoCodeButton } from "./CopyPromoCodeButton";
import { PromoExpiryPill } from "./PromoExpiryPill";
import { PromoMonogram } from "./PromoMonogram";
import { promoMerchant, shopDomain } from "./promoPresentation";
import { PromoTicketDetail } from "./PromoTicketDetail";
import { savedDayLabel } from "./promoDates";
import { NO_EXPIRY_LABEL } from "./promoExpiryLabel";

interface Props {
  promo: PromoListing;
  now: Date;
  /** A lapsed promo's ticket is drawn neutral rather than amber. */
  expired?: boolean;
}

const UNSTATED = "—";

const VALID_UNTIL = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * The promo itself, at the top of the reader: who it is from and when it was
 * kept, the offer in display type, the code with its one labelled Copy, and
 * the small print — terms, the last valid day (a UTC date, see
 * `promoExpiryLabel`) and the shop's site, read off the sender's address.
 *
 * Every field here is one of the model's guesses, which is why the reader's
 * Edit corrects them in place of this ticket. Nothing on it writes.
 */
export const PromoTicket = ({ promo, now, expired }: Props) => {
  const merchant = promoMerchant(promo);
  const shop = shopDomain(promo.fromEmail);
  const provenance = promo.savedAt
    ? `Saved ${savedDayLabel(promo.savedAt, now)} · ${promo.accountEmail}`
    : `Not saved yet · ${promo.accountEmail}`;

  return (
    <section
      aria-label="Promo"
      className={cn(
        "flex flex-col gap-4 rounded-[14px] border p-5",
        expired
          ? "border-gousse-line bg-gousse-bg"
          : "border-gousse-medium/30 bg-gousse-medium-bg/50",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <PromoMonogram name={merchant} size={36} plain={!expired} muted={expired} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold text-gousse-ink">
            {merchant ?? UNSTATED}
          </span>
          <span className="truncate text-xs text-gousse-muted">{provenance}</span>
        </div>
        <PromoExpiryPill expiresAt={promo.expiresAt} now={now} onTicket />
      </div>
      <p className="text-[34px] leading-tight font-bold text-gousse-ink">{promo.discount}</p>
      {promo.code ? <CopyPromoCodeButton code={promo.code} variant="ticket" /> : null}
      <dl className="flex flex-col gap-2 pt-1">
        <PromoTicketDetail label="Terms">{promo.terms ?? UNSTATED}</PromoTicketDetail>
        <PromoTicketDetail label="Valid until">
          {promo.expiresAt ? VALID_UNTIL.format(new Date(promo.expiresAt)) : NO_EXPIRY_LABEL}
        </PromoTicketDetail>
        {shop ? (
          <PromoTicketDetail label="Shop">
            <a
              href={`https://${shop}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gousse-navy hover:underline"
            >
              {shop}
            </a>
          </PromoTicketDetail>
        ) : null}
      </dl>
    </section>
  );
};
