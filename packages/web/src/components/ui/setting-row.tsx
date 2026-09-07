import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/gousse/utils";

/**
 * The settings surface: a {@link SettingsCard} holding a stack of
 * {@link SettingRow}s, each one label + description on the left and its control
 * on the right.
 *
 * The card draws the dividers, not the rows. A row that drew its own top border
 * would double it against its neighbour's bottom, and the first row would need
 * to know it was first — `divide-y` on the parent is the version with no
 * special cases.
 *
 * `overflow-hidden` on the card is what makes the radius bite: without it the
 * first and last rows' square backgrounds paint over the rounded corners.
 */
export function SettingsCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "divide-y divide-gousse-line/55 overflow-hidden rounded-3xl border border-gousse-line/60 bg-gousse-panel shadow-gousse-sm",
        className,
      )}
      {...props}
    />
  );
}

interface SettingRowProps extends Omit<ComponentProps<"div">, "title"> {
  title: ReactNode;
  description?: ReactNode;
  /** Slot before the text — an icon, an avatar, a provider mark. */
  leading?: ReactNode;
  /** Slot after the text — the switch, select or button the row is about. */
  control?: ReactNode;
  /**
   * Top-align the columns instead of centring them. Turn it on when the row
   * grows a `children` block: with a field unfolded underneath, a centred
   * control drifts to the middle of a tall row and loses its tie to the label.
   */
  alignTop?: boolean;
  /** Rendered under the description, full width — an unfolded field or notice. */
  children?: ReactNode;
}

export function SettingRow({
  title,
  description,
  leading,
  control,
  alignTop = false,
  className,
  children,
  ...props
}: SettingRowProps) {
  return (
    <div
      className={cn(
        "flex gap-4 px-5 py-3.5",
        alignTop ? "items-start" : "items-center",
        className,
      )}
      {...props}
    >
      {leading ? <div className="flex flex-none">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-gousse-ink">{title}</div>
        {description ? (
          <div className="mt-0.5 text-xs text-gousse-muted">{description}</div>
        ) : null}
        {children}
      </div>
      {control ? <div className="flex flex-none items-center gap-2">{control}</div> : null}
    </div>
  );
}
