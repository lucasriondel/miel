import { Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/gousse/utils";

/**
 * The status tick beside an autosaving control. Three exclusive states —
 * saving, failed, saved — and `null` at rest, so a settled row carries no
 * leftover chrome.
 *
 * Autosaving controls have no submit button to put a spinner in, which is what
 * this replaces. It renders in the flow rather than as a toast: the feedback
 * belongs beside the thing that changed, and a row that saves on every keypress
 * would otherwise stack toasts.
 *
 * `aria-live="polite"` announces the outcome without interrupting; the error
 * branch upgrades to `role="alert"` because a failed save is worth cutting in
 * for — the user is about to walk away believing the value stuck.
 */
export function SavedFlash({
  saving,
  saved,
  error,
  className,
  savingLabel = "Saving…",
  savedLabel = "Saved",
}: {
  saving?: boolean;
  saved?: boolean;
  error?: string | null;
  className?: string;
  savingLabel?: string;
  savedLabel?: string;
}) {
  if (saving) {
    return (
      <span
        aria-live="polite"
        className={cn("flex items-center gap-1 text-xs text-gousse-muted", className)}
      >
        <Spinner size={12} /> {savingLabel}
      </span>
    );
  }

  if (error) {
    return (
      <span role="alert" className={cn("text-xs text-gousse-high", className)}>
        {error}
      </span>
    );
  }

  if (saved) {
    return (
      <span
        aria-live="polite"
        className={cn(
          "flex items-center gap-1 text-xs font-medium text-gousse-low",
          className,
        )}
      >
        <Check size={13} strokeWidth={3} aria-hidden /> {savedLabel}
      </span>
    );
  }

  return null;
}
