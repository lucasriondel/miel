import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/gousse/utils";

/**
 * The shared pill chassis for gousse's family of badges (label, system, suggested,
 * filter-action). Folds the four hand-rolled pill bricks onto one cva component;
 * the domain-specific logic (Gmail system-label lookup, remove handlers, apply
 * handlers) stays in the thin web wrappers that render a <Badge>.
 *
 * Variants map 1:1 to the old bricks' looks:
 * - `neutral`   — LabelBadge with no color (bg-gousse-line/50 hover)
 * - `colored`   — LabelBadge WITH a color; pass `style` for the inline bg/fg
 *                 (escape hatch for arbitrary Gmail label colors, not tokens)
 * - `system`    — SystemLabelBadge chassis; the per-label color comes via
 *                 `className` from getSystemLabelMeta
 * - `suggested` — dashed "suggested existing" pill (? glyph)
 * - `suggestedNew` — accent "suggested new" pill (+ glyph)
 * - `action`    — quiet filter-action pill (inset ring); font-semibold, no shadow
 *
 * `interactive` adds the press feel (`active:scale-[0.96]`) shared by the
 * clickable variants; the wrappers pass it when they render a <button>.
 */
const badge = cva(
  "inline-flex items-center rounded-full text-xs font-bold",
  {
    variants: {
      variant: {
        neutral:
          "gap-1.5 bg-gousse-line/50 px-2 py-0.5 text-gousse-muted shadow-gousse-sm hover:bg-gousse-line/70 sm:px-2.5 sm:py-1",
        colored: "gap-1.5 px-2 py-0.5 shadow-gousse-sm sm:px-2.5 sm:py-1",
        system:
          "gap-1.5 px-2 py-0.5 shadow-gousse-sm sm:px-2.5 sm:py-1",
        suggested:
          "gap-1.5 border border-dashed border-gousse-line bg-gousse-panel px-2 py-0.5 text-gousse-muted shadow-gousse-sm sm:px-2.5 sm:py-1",
        suggestedNew:
          "gap-1.5 border border-gousse-accent/50 bg-gousse-accent/15 px-2 py-0.5 text-gousse-accent shadow-gousse-sm sm:px-2.5 sm:py-1",
        action: "px-2.5 py-1 font-semibold",
      },
      interactive: {
        true: "transition-all active:scale-[0.96]",
        false: "",
      },
    },
    // The old colored LabelBadge animated only `transition-transform` (no hover
    // color to tween), unlike the neutral/suggested pills which used
    // `transition-all`. Preserve that exactly — twMerge lets this later class win.
    compoundVariants: [
      { variant: "colored", interactive: true, class: "transition-transform" },
    ],
    defaultVariants: { variant: "neutral", interactive: false },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badge>["variant"]>;

type BadgeOwnProps = VariantProps<typeof badge> & {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

/** Rendered as a <span> — for interactive badges the wrappers render their own
 *  <button> and pass these classes via {@link badgeClasses}. */
export function Badge({
  variant,
  interactive,
  className,
  style,
  children,
  ...props
}: BadgeOwnProps & Omit<ComponentProps<"span">, "style" | "className" | "children">) {
  return (
    <span className={cn(badge({ variant, interactive }), className)} style={style} {...props}>
      {children}
    </span>
  );
}

/** Class string for consumers that need to style their own element (e.g. a
 *  <button> for a removable/clickable badge) with the badge chassis. */
export function badgeClasses(
  opts: VariantProps<typeof badge>,
  className?: string,
): string {
  return cn(badge(opts), className);
}
