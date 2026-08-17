import type { ComponentProps } from "react";
import { FIELD_BOX, FIELD_CHROME } from "@/lib/gousse/field-chrome";
import { cn } from "@/lib/gousse/utils";

/**
 * Multi-line text field sharing {@link Input}'s chrome via {@link FIELD_CHROME}
 * (border, bg, the folded `focus:border-gousse-ink focus:outline-hidden`).
 * `className` extends or overrides via cn() — e.g. FilterSimilarPopover passes
 * `resize-none`, a `bg-gousse-bg` override, placeholder + disabled treatment.
 *
 * Shape is the one place it parts from {@link Input}: a textarea takes
 * {@link FIELD_BOX} (`rounded-2xl`) rather than the pill, because a tall
 * multi-line box with fully-round ends wastes its first and last lines to the
 * corner arc. Round, but still a corner.
 */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(FIELD_CHROME, FIELD_BOX, className)} {...props} />;
}
