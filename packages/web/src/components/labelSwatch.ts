/**
 * The colour a Gmail label is shown by when it is a small mark (the sidebar's
 * square), as opposed to a chip that wears both of its colours.
 *
 * Gmail's palette pairs a background with a text colour, and half its
 * backgrounds are pale tints whose text colour is the saturated one ("#fce8b3"
 * on "#594c05"). A pale square on the grey sidebar reads as no colour at all,
 * so the mark takes whichever of the pair is darker, unless that is plain
 * white or black.
 */
const luminance = (hex: string): number | undefined => {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return undefined;
  const n = parseInt(full, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

const FALLBACK = "rgb(138 150 163)";

export const labelSwatch = (colorBg: string | null, colorFg: string | null): string => {
  const bg = colorBg ? luminance(colorBg) : undefined;
  const fg = colorFg ? luminance(colorFg) : undefined;
  if (colorBg && bg !== undefined && bg <= 0.75) return colorBg;
  if (colorFg && fg !== undefined && fg > 0.05 && fg < 0.95) return colorFg;
  return colorBg ?? FALLBACK;
};
