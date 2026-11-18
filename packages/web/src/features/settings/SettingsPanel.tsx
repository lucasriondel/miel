import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** The card's heading — "Tasks", "Providers". Omitted for a card of rows alone. */
  title?: ReactNode;
  /** A control on the heading's row, right-aligned: Mailboxes' Connect button. */
  action?: ReactNode;
  /** A full-width band under the heading: the Tasks table's column labels. */
  header?: ReactNode;
  /** Names the card for assistive tech when it has no visible title. */
  label?: string;
  /**
   * Draw the hairline between the heading and the first row. Off for a card
   * whose body is one block rather than rows — Triage batching's two fields.
   */
  divided?: boolean;
  /** A band after the rows: the Sync card's status line. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * One settings card as the redesign draws it: white, a 12px corner, a hairline
 * edge and no shadow, its rows separated by the lighter fill hairline.
 *
 * The card draws the dividers, not the rows, for the reason the registry's
 * `SettingsCard` did: a row that drew its own border would double it against a
 * neighbour's. `overflow-hidden` is what makes the corner bite on the first and
 * last rows' backgrounds.
 */
export const SettingsPanel = ({
  title,
  action,
  header,
  label,
  footer,
  divided = true,
  children,
  className,
}: Props) => (
  <section
    aria-label={label}
    className={cn(
      "overflow-hidden rounded-xl border border-gousse-line bg-gousse-panel",
      className,
    )}
  >
    {title ? (
      <div className="flex items-center gap-4 px-4 pt-3.5 pb-3">
        <h2 className="min-w-0 flex-1 text-sm font-semibold text-gousse-ink">{title}</h2>
        {action}
      </div>
    ) : null}
    {header}
    <div
      className={cn(
        "divide-y divide-gousse-fill",
        title && !header && divided && "border-t border-gousse-fill",
      )}
    >
      {children}
    </div>
    {footer}
  </section>
);
