import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { iconButtonClass, iconButtonIconClass } from "../../components/iconButton";

/**
 * Where the code is drawn:
 * - `chip`: compact, inline beside other text (the message page's promo panel).
 * - `field`: the code box of a page card or row — the whole box is the button.
 * - `ticket`: the reader's large code line, with a labelled "Copy code" button.
 * - `icon`: the glyph alone, for the reader's toolbar.
 */
export type CopyPromoCodeVariant = "chip" | "field" | "ticket" | "icon";

interface Props {
  code: string;
  variant?: CopyPromoCodeVariant;
  className?: string;
}

/** How long the confirmation stays up — long enough to read, short enough to go. */
const COPIED_RESET_MS = 1600;

const FACE: Record<CopyPromoCodeVariant, string> = {
  chip: "inline-flex items-center gap-2 rounded-md border border-gousse-border-strong bg-gousse-bg px-2 py-1 text-xs",
  field:
    "flex h-8 w-full items-center gap-2 rounded-lg border border-gousse-border-strong bg-gousse-bg pr-2.5 pl-3 text-xs hover:bg-gousse-hover",
  ticket:
    "flex h-14 w-full items-center gap-3 rounded-[10px] border border-gousse-medium/45 bg-gousse-panel pr-2 pl-[18px] text-[19px]",
  icon: iconButtonClass(),
};

/**
 * The code, as the one control that takes it (#163).
 *
 * The code *is* the button rather than carrying one beside it: the whole point
 * is one click at a checkout, and a user reaching for a code aims at the code.
 *
 * **Copying changes no state.** No request leaves, no flag is set and no
 * timestamp is written — there is no signal anywhere that a code was ever
 * redeemed, so a "used" mark would have to be un-marked by hand and would lie
 * in the meantime. Checking whether a code still works must not cost the user
 * an edit. The confirmation is therefore local and transient: it says the
 * clipboard was written, which is the only thing that happened.
 */
export const CopyPromoCodeButton = ({ code, variant = "chip", className }: Props) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  // The row can leave the page (a refetch, a navigation) while the confirmation
  // is still up, and a timer firing into an unmounted component sets state on
  // nothing.
  useEffect(() => () => window.clearTimeout(timer.current ?? undefined), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.clearTimeout(timer.current ?? undefined);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  const Glyph = copied ? Check : Copy;
  const name = copied ? "Copied" : "Copy code";

  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-label={name}
        title={name}
        onClick={handleCopy}
        className={cn(FACE.icon, className)}
      >
        <Glyph className={iconButtonIconClass()} aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={name}
      title={name}
      onClick={handleCopy}
      className={cn(
        "relative font-mono font-bold tracking-wide text-gousse-ink transition-[background-color,transform] active:scale-[0.98]",
        FACE[variant],
        className,
      )}
    >
      <span className="min-w-0 flex-1 truncate text-left">{code}</span>
      {variant === "ticket" ? (
        <span className="inline-flex h-[38px] shrink-0 items-center gap-[7px] rounded-lg bg-gousse-primary pr-3.5 pl-3 font-sans text-[13px] font-semibold tracking-normal text-gousse-on-primary hover:bg-gousse-primary-hover">
          <Glyph className="h-3.5 w-3.5" aria-hidden />
          {copied ? "Copied" : "Copy code"}
        </span>
      ) : (
        <Glyph
          className={cn("h-3.5 w-3.5 shrink-0", copied ? "text-gousse-low" : "text-gousse-muted")}
          aria-hidden
        />
      )}
    </button>
  );
};
