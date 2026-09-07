import { Reply } from "lucide-react";

interface Props {
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Primary action on the message-detail bar, in the slot the Sync button used to
 * hold. Sync moved out entirely: it acts on the whole mailbox, so it belongs on
 * the inbox where the result is visible, not on a page showing one message.
 *
 * Weighted like the inbox's Triage pill — an accent tint over a panel surface
 * at rest, resolving to bare panel on hover — rather than a solid fill. The
 * inbox spends a solid ink fill only on `SelectModeButton`'s *active* state, so
 * a resting button wearing it here would read as the loudest thing on either
 * bar.
 */
export const ReplyButton = ({ onClick, disabled }: Props) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label="Reply"
    title="Reply"
    className="group/reply relative isolate inline-flex h-9 items-center gap-1.5 overflow-hidden rounded-full border border-gousse-line bg-gousse-panel px-3.5 text-[13px] font-bold text-gousse-accent shadow-gousse-sm transition-[color,box-shadow,transform] duration-150 active:scale-95 hover:text-gousse-ink hover:shadow-gousse-lg disabled:cursor-not-allowed disabled:opacity-60 group-data-[scrolled=true]/bar:shadow-gousse-lg"
  >
    {/* Accent wash, faded out on hover so the pill resolves to bare panel. */}
    <span
      aria-hidden
      className="absolute inset-0 -z-10 bg-gousse-accent/[0.12] transition-opacity duration-150 group-hover/reply:opacity-0"
    />
    <Reply className="h-4 w-4 shrink-0" aria-hidden />
    <span className="hidden sm:inline">Reply</span>
  </button>
);
