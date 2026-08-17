import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Extra classes (e.g. asymmetric padding for a trailing label). */
  className?: string;
}

/**
 * Rounded pill container for a top-bar cluster. Stays opaque while the bar
 * shell fades on scroll, picking up a lifted shadow via the parent's
 * `[data-scrolled]` attribute.
 *
 * Horizontal padding is deliberately larger than vertical: the pill's ends are
 * fully rounded, so a round child sitting flush against them reads as pinched
 * even when the raw gap matches the top/bottom one. The extra 2px buys back the
 * space the corner curve eats. Don't override the padding per island — an even
 * optical inset on every side is the point.
 */
export const Island = ({ children, className = "" }: Props) => (
  <div
    className={`inline-flex items-center gap-2 rounded-full border border-gousse-line bg-gousse-panel px-2 py-1.5 shadow-gousse-sm transition-shadow duration-300 group-data-[scrolled=true]/bar:shadow-gousse-lg ${className}`}
  >
    {children}
  </div>
);
