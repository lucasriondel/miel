import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** The header's lead glyph and words. */
  header: ReactNode;
  /** Right-aligned in the header: Regenerate. */
  aside?: ReactNode;
  tone?: "default" | "sent";
  children: ReactNode;
}

/** The draft card's frame: a 12px-cornered card with a soft lift, header row on top. */
export const DraftReplyShell = ({ header, aside, tone = "default", children }: Props) => (
  <section
    aria-label="Draft reply"
    className={cn(
      "flex flex-col gap-3 rounded-xl border p-4",
      tone === "sent"
        ? "gap-2 border-gousse-tint-green bg-gousse-tint-green/50"
        : "border-gousse-line bg-gousse-panel shadow-gousse-md",
    )}
  >
    <div className="flex items-center gap-1.5 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0">
      {header}
      {aside ? <span className="ml-auto">{aside}</span> : null}
    </div>
    {children}
  </section>
);
