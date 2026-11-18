/**
 * The one shape every icon-only action button in the app wears.
 *
 * There were five hand-written spellings of this button — the inbox row's, the
 * detail top bar's, the section header's, the category select's and the bulk
 * bar's — and they disagreed on all three things a user can actually see: the
 * radius (`rounded-lg` against `rounded-full`), the hit area (`h-8` against
 * `h-9`) and which properties the hover transitioned. Three of them are on
 * screen at once — a section header sits above rows whose actions reveal on
 * hover, with the detail bar a click away — so the disagreement read as three
 * different controls doing the same job.
 *
 * §3 already decided the radius and nothing followed it: "a control that could
 * be `rounded-lg` or `rounded-full` should be `rounded-full`". An icon button
 * is square, so it is exactly the control that rule is about, and a pill is the
 * one child shape exempt from the concentric arithmetic — which is why the
 * detail variant had already been converted on its own (its comment is the
 * argument, applied here to all of them).
 *
 * `size` is the only axis left, and it is a hit-area decision rather than a
 * style one: `md` is the 36px target for a bar the finger goes to deliberately
 * (the detail island, the bulk bar), `sm` the 32px one for buttons that sit in
 * a dense row. Both clear the 32px floor §5 sets; neither is a different
 * button.
 *
 * `danger` tints the hover toward `gousse-high` for the destructive member of a
 * set, and it is a hover tint only — a delete button reads as its siblings until
 * the pointer is on it.
 *
 * The classes are spelled out as whole literals rather than assembled from
 * fragments: Tailwind v4 scans source text, so a class built from a variable at
 * runtime compiles to no rule at all.
 */
/*
 * The redesign (`miel.figcraft`, UI System › Icon Button) draws these as 26px
 * squares with a 6px corner and a fill on hover, not as pills: they sit in rows
 * of quiet glyphs (section headers, the row action strip, the reader toolbar)
 * where a circle reads as a badge. `sm` is 28px and `md` 32px — the design's 26
 * rounded up to the hit areas §5 asks for.
 */
export type IconButtonSize = "sm" | "md";

const SIZE: Record<IconButtonSize, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
};

/** Icon glyph size for each button size, as a Tailwind class. */
const ICON: Record<IconButtonSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

/** Icon glyph size in px, for the spinner that stands in while an action runs. */
const ICON_PX: Record<IconButtonSize, number> = {
  sm: 14,
  md: 16,
};

/**
 * The shared base: shape, hit area, muted resting colour, press feedback and
 * the disabled treatment. Everything a variant is allowed to add sits after it.
 */
const BASE =
  "inline-flex items-center justify-center rounded-md text-gousse-muted transition-[background-color,color,transform] duration-150 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

const HOVER = "hover:bg-gousse-fill hover:text-gousse-ink active:bg-gousse-line";
const HOVER_DANGER = "hover:bg-gousse-high/10 hover:text-gousse-high";

export interface IconButtonOptions {
  size?: IconButtonSize;
  /** The destructive member of a set: tints the hover only. */
  danger?: boolean;
}

export const iconButtonClass = ({ size = "sm", danger }: IconButtonOptions = {}) =>
  `${BASE} ${SIZE[size]} ${danger ? HOVER_DANGER : HOVER}`;

export const iconButtonIconClass = (size: IconButtonSize = "sm") => ICON[size];

export const iconButtonIconPx = (size: IconButtonSize = "sm") => ICON_PX[size];
