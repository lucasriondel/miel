import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

interface Props {
  /** What the row says at rest — text, or a row of glyphs and chips. */
  label: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  summaryClassName?: string;
  /**
   * Set on a row rendered inside another row's body. `group-open:` matches *any*
   * open `.group` ancestor, so an unscoped nested row would rotate its chevron
   * the moment the outer row opened. Both variants are spelled out as literals
   * because Tailwind v4 scans source text and never sees an interpolated name.
   */
  nested?: boolean;
}

/**
 * A `<details>` whose summary is a full-width, pill-shaped click target with a
 * chevron that rotates on open (DESIGN.md §3, §5). `min-h-10` holds the 40px
 * floor even when the label is a single line of `text-xs`.
 *
 * Native disclosure rather than React state on purpose: the browser gives us
 * keyboard toggling, the open/closed accessibility semantics and find-in-page
 * for free, and `group-open:` reaches the chevron without a re-render.
 */
export const DisclosureRow = ({
  label,
  children,
  defaultOpen,
  className,
  summaryClassName,
  nested,
}: Props) => (
  <details className={cn(nested ? "group/nested" : "group", className)} open={defaultOpen}>
    <summary
      className={cn(
        "flex min-h-8 w-full cursor-pointer select-none list-none items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-gousse-muted transition-[background-color,color] hover:bg-gousse-fill hover:text-gousse-ink [&::-webkit-details-marker]:hidden",
        summaryClassName,
      )}
    >
      {label}
      <ChevronDown
        className={cn(
          "ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200",
          nested ? "group-open/nested:rotate-180" : "group-open:rotate-180",
        )}
        aria-hidden
      />
    </summary>
    {children}
  </details>
);
