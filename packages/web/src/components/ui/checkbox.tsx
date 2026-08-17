import type { ComponentProps } from "react";
import { cn } from "@/lib/gousse/utils";

/**
 * Styled native checkbox — folds the app's standard checkbox chrome
 * (h-4 w-4 rounded, gousse accent fill, focus:ring-gousse-accent). Renders a raw
 * <input type="checkbox">; the sr-only label + <label> wrapper stay in the
 * consuming composite (e.g. MessageRow). `className` extends/overrides via cn().
 */
export function Checkbox({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "h-4 w-4 cursor-pointer rounded border-gousse-line text-gousse-accent focus:ring-gousse-accent",
        className,
      )}
      {...props}
    />
  );
}
