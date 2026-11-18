import { cn } from "../../lib/utils";

interface Props {
  label: string;
  selected: boolean;
  onOpen: () => void;
  className?: string;
}

/**
 * The invisible button that makes a whole card or row open the reader — laid
 * over the surface, under its real controls (which sit above it with
 * `relative z-10`), so a click anywhere but the code, Save or delete opens the
 * promo. A button of its own rather than a click handler on the card, so the
 * keyboard reaches it and a screen reader names it.
 */
export const OpenPromoButton = ({ label, selected, onOpen, className }: Props) => (
  <button
    type="button"
    aria-label={label}
    aria-current={selected ? "true" : undefined}
    onClick={onOpen}
    className={cn(
      "absolute inset-0 rounded-[inherit] focus-visible:ring-[3px] focus-visible:ring-gousse-primary/30 focus-visible:outline-none",
      className,
    )}
  />
);
