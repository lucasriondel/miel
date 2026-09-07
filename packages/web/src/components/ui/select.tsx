import type { ComponentProps } from "react";
import { FIELD_CHROME, FIELD_PILL } from "@/lib/gousse/field-chrome";
import { cn } from "@/lib/gousse/utils";

/**
 * Thin styled wrapper over a native <select> — keeps OS picker semantics and
 * passes <option> children straight through, so consumers keep their own
 * option logic (the `__custom__` sentinel, out-of-preset extra options).
 * Only the field chrome is standardized; zero behavior change. `className`
 * extends/overrides via cn().
 *
 * Shares {@link FIELD_CHROME} with Input/Textarea and takes the same pill
 * ({@link FIELD_PILL}). Radius alone isn't enough here: a native select is
 * painted by the OS, which ignores `border-radius` outright, so the pill only
 * lands once the native appearance is dropped. `gousse-select` (effects.css)
 * does that and repaints the arrow the reset removes — an inline-SVG chevron
 * with a `.dark` variant, since a `url()` can't reference `currentColor`. It
 * also owns the horizontal padding, widening the right inset to clear that
 * chevron, so it must sit after FIELD_CHROME.
 */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(FIELD_CHROME, FIELD_PILL, "gousse-select", className)}
      {...props}
    >
      {children}
    </select>
  );
}
