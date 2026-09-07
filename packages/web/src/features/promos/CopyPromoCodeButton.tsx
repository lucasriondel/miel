import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  code: string;
}

/** How long the confirmation stays up — long enough to read, short enough to go. */
const COPIED_RESET_MS = 1600;

/**
 * The code, as the one control that takes it (#163).
 *
 * The chip *is* the button rather than carrying one beside it: the whole point
 * is one click at a checkout, and a user reaching for a code aims at the code.
 *
 * **Copying changes no state.** No request leaves, no flag is set and no
 * timestamp is written — there is no signal anywhere that a code was ever
 * redeemed, so a "used" mark would have to be un-marked by hand and would lie
 * in the meantime. Checking whether a code still works must not cost the user
 * an edit. The confirmation is therefore local and transient: it says the
 * clipboard was written, which is the only thing that happened.
 */
export const CopyPromoCodeButton = ({ code }: Props) => {
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

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy code"}
      title={copied ? "Copied" : "Copy code"}
      onClick={handleCopy}
      className="inline-flex items-center gap-2 rounded-lg border border-dashed border-gousse-line bg-gousse-bg px-2 py-1 font-mono text-xs font-bold tracking-widest text-gousse-ink transition-[background-color,transform] hover:bg-gousse-ink/10 active:scale-[0.97]"
    >
      {code}
      {copied ? (
        <Check className="h-3.5 w-3.5 text-gousse-low" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5 text-gousse-muted" aria-hidden />
      )}
    </button>
  );
};
