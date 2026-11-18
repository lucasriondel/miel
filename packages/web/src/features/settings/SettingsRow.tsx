import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props extends Omit<ComponentProps<"div">, "title"> {
  title: ReactNode;
  description?: ReactNode;
  /** Before the text: an avatar, a provider mark. */
  leading?: ReactNode;
  /** After the text: the control the row is about. */
  control?: ReactNode;
  /** Top-align the columns when the row grows a `children` block. */
  alignTop?: boolean;
  /** Under the description, full width — an unfolded field or notice. */
  children?: ReactNode;
}

/**
 * One row of a settings card: label on the left, its control on the right — the
 * registry's `SettingRow` shape, redrawn at the redesign's size (16px inset, a
 * 13px medium label, a 12px muted line under it). Same props, so a row moves
 * between the two by its import alone.
 */
export const SettingsRow = ({
  title,
  description,
  leading,
  control,
  alignTop = false,
  className,
  children,
  ...props
}: Props) => (
  <div
    className={cn("flex gap-4 px-4 py-4", alignTop ? "items-start" : "items-center", className)}
    {...props}
  >
    {leading ? <div className="flex flex-none">{leading}</div> : null}
    <div className="min-w-0 flex-1">
      <div className="text-[13px] font-medium text-gousse-ink">{title}</div>
      {description ? <div className="mt-0.5 text-xs text-gousse-muted">{description}</div> : null}
      {children}
    </div>
    {control ? <div className="flex flex-none items-center gap-2">{control}</div> : null}
  </div>
);
