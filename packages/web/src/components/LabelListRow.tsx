import type { CSSProperties, ReactNode } from "react";
import { sidebarRowClass } from "@/components/ui/sidebar";

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
 * Shared sidebar row. Layout + typography live here; the hue-driven surfaces
 * (bg, left active bar, glyph/count tint) come from `.sidebar-row` in index.css
 * so a single `--hue` custom property can feed rest/hover/active uniformly.
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
  // One step = the glyph slot + its gap, so a child's text sits directly under
  // its parent's text rather than drifting off on its own margin.
  if (depth > 0) style.paddingLeft = `${0.625 + depth * 1.625}rem`;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-active={active}
      data-tinted={tinted ? "true" : undefined}
      data-collapsed={collapsed ? "true" : undefined}
      style={style}
      className={sidebarRowClass(active)}
    >
      {children}
      {trailing}
    </button>
  );
};
