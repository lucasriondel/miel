import type { ComponentProps } from "react";
import { FIELD_CHROME, FIELD_PILL } from "@/lib/gousse/field-chrome";
import { cn } from "@/lib/gousse/utils";

/**
 * Text input with the app's standard field chrome ({@link FIELD_CHROME}),
 * folding the recurring `focus:border-gousse-ink focus:outline-hidden` focus
 * treatment shared by the reply/compose fields. Shaped as a pill
 * ({@link FIELD_PILL}) — the kit's round control language. `className` extends
 * or overrides via cn().
 *
 * Narrow or numeric inputs should add `text-center`: an off-centre value inside
 * a pill reads as broken.
 *
 * NOTE: fields with genuinely different chrome (ModelPicker's no-focus mono
 * input, SyncRangeControls' tighter date inputs) stay raw <input> — routing
 * them here would add a focus ring / change padding, which the behavior
 * contract forbids.
 */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(FIELD_CHROME, FIELD_PILL, className)} {...props} />;
}
