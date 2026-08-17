import type { ComponentProps } from "react";
import { Separator as BaseSeparator } from "@base-ui-components/react/separator";
import { cn } from "@/lib/gousse/utils";

/**
 * Thin rule that consolidates the app's hand-rolled `h-px bg-gousse-line`
 * (horizontal) and `w-px bg-gousse-line` (vertical) dividers. Wraps Base UI's
 * `Separator` for the correct `role="separator"` + `aria-orientation`
 * semantics; decorative by default (Base UI omits the a11y role only when a
 * consumer opts out — here we keep it, matching the old `aria-hidden` spans'
 * intent of "a visual divider" while gaining proper semantics).
 *
 * NOTE: only true standalone dividers route here. Structural `border-b
 * border-gousse-line` on headers/rows/thead stays inline — converting those to a
 * Separator element would change layout, which the behavior contract forbids.
 */
export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: ComponentProps<typeof BaseSeparator>) {
  return (
    <BaseSeparator
      orientation={orientation}
      className={cn(
        "shrink-0 bg-gousse-line",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
