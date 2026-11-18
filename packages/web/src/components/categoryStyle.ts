import type { CSSProperties } from "react";
import type { SystemLabelMeta } from "./systemLabels";

/**
 * The custom properties one inbox category subgroup paints itself with — read
 * by the `.category-group*` rules in `index.css`. A category without a hue
 * (Primary) sets nothing and takes the neutral defaults there: an ink tint
 * band, ink name, muted glyph and count.
 */
export const categoryStyle = (meta: SystemLabelMeta | undefined): CSSProperties | undefined => {
  if (!meta?.hue) return undefined;
  const vars: Record<string, string> = { "--hue": meta.hue };
  if (meta.ink) vars["--cat-ink"] = meta.ink;
  if (meta.inkDark) vars["--cat-ink-dark"] = meta.inkDark;
  if (meta.tint !== undefined) vars["--tint-head"] = String(meta.tint);
  return vars as CSSProperties;
};
