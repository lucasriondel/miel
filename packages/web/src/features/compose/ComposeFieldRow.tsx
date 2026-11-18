import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** The row's name — "From", "To", "Cc", "Bcc" — or none for Subject. */
  label?: string;
  /** Ties the label to the control it names. */
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/**
 * One header row of a compose window: a 44px band with a hairline under it, the
 * label in a fixed 48px column so every row's content starts on one line. The
 * focused row's hairline and label darken, which is the only focus treatment a
 * row of bare fields needs.
 */
export const ComposeFieldRow = ({ label, htmlFor, className, children }: Props) => (
  <div
    className={cn(
      "group/row flex min-h-11 shrink-0 items-center gap-2 border-b border-gousse-fill px-5 py-1.5 text-[13px] focus-within:border-gousse-border-strong",
      className,
    )}
  >
    {label ? (
      <label
        htmlFor={htmlFor}
        className="w-12 shrink-0 font-medium text-gousse-muted group-focus-within/row:text-gousse-ink"
      >
        {label}
      </label>
    ) : null}
    {children}
  </div>
);
