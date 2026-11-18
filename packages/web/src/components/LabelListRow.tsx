import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  active: boolean;
  onClick: () => void;
  depth?: number;
  title?: string;
  /** Category accent as an `r g b` triplet; drives the row's `--hue`. */
  hue?: string;
  /** Tint the glyph with the hue at rest (used for Gmail categories). */
  tinted?: boolean;
  /** Collapsed state of the branch this row heads; rotates the chevron. */
  collapsed?: boolean;
  /** Trailing slot (e.g. the collapse chevron). */
  trailing?: ReactNode;
  children: ReactNode;
}

/**
 * One label row in the sidebar (UI System › Sidebar Label Item): 30px, an 8px
 * corner, the label's colour as a small square and its name. Selected is the
 * brand ink at 10% with the name in semibold, the same treatment as the nav
 * rows above it, so the two lists read as one column of places to go.
 *
 * `--hue` still rides on the row for the nested tree's chevron and children
 * (`.sidebar-children` in the vendored sidebar sheet), but nothing here paints
 * with it: the colour a label owns is its swatch, and only its swatch.
 */
export const LabelListRow = ({
  active,
  onClick,
  depth = 0,
  title,
  hue,
  tinted,
  collapsed,
  trailing,
  children,
}: Props) => {
  const style: CSSProperties = {};
  if (hue) (style as Record<string, string>)["--hue"] = hue;
  // One step = the swatch slot + its gap, so a child's text sits directly under
  // its parent's text rather than drifting off on its own margin.
  if (depth > 0) style.paddingLeft = `${0.625 + depth * 1.375}rem`;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-active={active}
      data-tinted={tinted ? "true" : undefined}
      data-collapsed={collapsed ? "true" : undefined}
      style={style}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex h-[30px] w-full shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors duration-150",
        active
          ? "bg-gousse-primary/10 font-semibold text-gousse-primary"
          : "text-gousse-ink hover:bg-gousse-primary/5",
      )}
    >
      {children}
      {trailing}
    </button>
  );
};
