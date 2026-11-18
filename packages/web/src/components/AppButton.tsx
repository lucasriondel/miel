import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The app's text button, as the redesign draws it (`miel.figcraft`, UI System ›
 * Button): a 30px box with an 8px corner, 12px semibold label, the brand ink as
 * the primary fill and a white bordered secondary.
 *
 * It wraps the vendored `Button` rather than replacing it — the registry's
 * component keeps its press feedback and stays the one primitive — and restates
 * only what the design changes: shape, size and colour. `cn` is tailwind-merge,
 * so these win over the registry's pill chassis class for class.
 */
const appButton = cva(
  "h-[30px] gap-1.5 rounded-lg px-3 py-0 text-xs font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-gousse-primary/30 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        primary:
          "bg-gousse-primary text-gousse-on-primary hover:bg-gousse-primary-hover active:bg-gousse-primary-pressed disabled:bg-gousse-disabled disabled:text-gousse-on-primary",
        secondary:
          "border border-gousse-border bg-gousse-panel text-gousse-ink hover:border-gousse-border-strong hover:bg-gousse-hover active:bg-gousse-fill disabled:bg-gousse-bg disabled:text-gousse-disabled-ink disabled:opacity-100",
        ghost:
          "bg-transparent text-gousse-muted hover:bg-gousse-fill hover:text-gousse-ink active:bg-gousse-line",
        danger:
          "bg-gousse-high text-white hover:bg-gousse-high/90 active:bg-gousse-error disabled:opacity-50",
      },
      size: {
        sm: "h-[26px] px-2.5",
        md: "",
        lg: "h-9 px-4 text-[13px]",
      },
    },
    defaultVariants: { tone: "secondary", size: "md" },
  },
);

export interface AppButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof appButton> {
  children: ReactNode;
}

export const AppButton = ({ tone, size, className, type, children, ...rest }: AppButtonProps) => (
  // `variant="ghost"`: the registry's quietest chassis, so none of its own
  // fills or borders leak under the tones above.
  <Button
    {...rest}
    variant="ghost"
    type={type ?? "button"}
    className={cn(appButton({ tone, size }), className)}
  >
    {children}
  </Button>
);
