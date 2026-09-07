import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/gousse/utils";

/**
 * Accessible radio group built on native inputs (not Base UI) to preserve the
 * app's existing sr-only-radio pattern exactly. `RadioGroup` is the
 * `role="radiogroup"` container; `RadioGroupItem` is a selectable row —
 * a <label> wrapping a visually-hidden radio, with the checked/unchecked
 * styling + `active:scale-[0.98]` press folded in. Consumers (AccountPicker)
 * keep their own loading/error/empty states and map data to items.
 *
 * Items are pills, matching the kit's round control language; the inset widens
 * to `px-5` so the label clears the corner arc.
 */
export function RadioGroup({ className, ...props }: ComponentProps<"div">) {
  return <div role="radiogroup" className={cn("flex flex-col gap-1", className)} {...props} />;
}

interface RadioGroupItemProps {
  /** radio `name` — shared across a group's items. */
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
  className?: string;
}

export function RadioGroupItem({
  name,
  value,
  checked,
  onSelect,
  children,
  className,
}: RadioGroupItemProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center rounded-full px-5 py-2 text-sm font-medium transition-all active:scale-[0.98]",
        checked
          ? "bg-gousse-accent/15 text-gousse-ink font-bold shadow-gousse-sm"
          : "text-gousse-muted hover:bg-gousse-line/20 hover:text-gousse-ink",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      {children}
    </label>
  );
}
