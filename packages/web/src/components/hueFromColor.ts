/**
 * Turn a Gmail label color into the `r g b` triplet `.sidebar-row` expects for
 * its `--hue` (index.css drives bg/left bar/glyph off it). Gmail hands us hex,
 * either `#rgb` or `#rrggbb`; anything else returns undefined so the row falls
 * back to `--gousse-accent` rather than rendering a broken color.
 */
export const hueFromColor = (color: string | null | undefined): string | undefined => {
  if (!color) return undefined;

  const hex = color.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;

  if (!/^[0-9a-f]{6}$/i.test(full)) return undefined;

  const n = parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};
