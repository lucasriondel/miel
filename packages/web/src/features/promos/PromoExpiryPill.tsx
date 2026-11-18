import { Clock } from "lucide-react";
import { cn } from "../../lib/utils";
import { promoExpiryState, type PromoExpiryTone } from "./promoExpiryLabel";

interface Props {
  expiresAt: string | null;
  now: Date;
  /** The ticket's pill sits on an amber card, so its "soon" fill is a shade deeper. */
  onTicket?: boolean;
}

const TONE: Record<PromoExpiryTone, string> = {
  soon: "bg-gousse-medium-bg text-gousse-medium-text",
  normal: "bg-gousse-fill text-gousse-quiet",
  ended: "text-gousse-subtle",
  none: "text-gousse-muted",
};

/**
 * A promo's deadline as a pill: amber inside a week, neutral further off, bare
 * text once it has passed or when the mail stated none.
 */
export const PromoExpiryPill = ({ expiresAt, now, onTicket }: Props) => {
  const { tone, label } = promoExpiryState(expiresAt, now);
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full pr-2 pl-[7px] text-xs font-medium whitespace-nowrap",
        TONE[tone],
        onTicket && "h-6 pr-2.5 pl-2 font-semibold",
        onTicket && tone === "soon" && "bg-gousse-tint-amber",
      )}
    >
      <Clock className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
};
