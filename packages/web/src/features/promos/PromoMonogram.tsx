import { cn } from "../../lib/utils";
import { monogramInitials, monogramTone } from "./promoPresentation";

interface Props {
  name: string | null;
  /** 28 on a card, 32 on a row, 36 on the ticket. */
  size?: 28 | 32 | 36;
  /** A lapsed promo's: grey letters on the neutral fill. */
  muted?: boolean;
  /** The selected row's and the ticket's: white disc, ink letters. */
  plain?: boolean;
}

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  28: "h-7 w-7 text-xs",
  32: "h-8 w-8 text-[11px]",
  36: "h-9 w-9 text-xs",
};

/**
 * The shop's initials in a tinted disc — how a promo is recognised at a glance
 * on the page, the way a sender's avatar is in the inbox. Decorative: the name
 * is always written beside it, so it is hidden from assistive tech.
 */
export const PromoMonogram = ({ name, size = 32, muted, plain }: Props) => {
  const tone = monogramTone(name);
  const style = muted || plain ? undefined : { backgroundColor: tone.bg, color: tone.fg };
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        SIZE[size],
        muted && "bg-gousse-fill text-gousse-muted",
        plain && "border border-gousse-medium/30 bg-gousse-panel text-gousse-ink",
      )}
    >
      {monogramInitials(name)}
    </span>
  );
};
