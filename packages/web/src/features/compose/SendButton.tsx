import { Archive, ChevronUp, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  disabled: boolean;
  sending: boolean;
  /** After a refusal the same button says "Retry send". */
  retry: boolean;
  onSend: () => void;
  /** Replies only: the caret opens Send / Send & archive. */
  onSendAndArchive?: () => void;
}

const FACE =
  "inline-flex h-9 items-center gap-2 text-[13px] font-semibold text-gousse-on-primary transition-[background-color,transform] active:scale-[0.96] disabled:cursor-not-allowed";

/**
 * Send, with ⌘↵ beside the word. A reply's carries a caret that opens upward
 * onto Send & archive (⌘⇧↵) — the triage-shaped default for mail you are done
 * with once answered. Disabled is a grey fill, not a faded ink one, and the
 * footer says why beside it.
 */
export const SendButton = ({ disabled, sending, retry, onSend, onSendAndArchive }: Props) => {
  const fill = disabled
    ? "bg-gousse-border-strong"
    : sending
      ? "bg-gousse-primary-hover"
      : "bg-gousse-primary hover:bg-gousse-primary-hover";
  return (
    <span className={cn("inline-flex shrink-0 overflow-hidden rounded-[10px]", fill)}>
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || sending}
        aria-label={sending ? "Sending…" : retry ? "Retry send" : "Send"}
        title="⌘↵"
        className={cn(FACE, "pr-3.5 pl-4")}
      >
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {sending ? "Sending…" : retry ? "Retry send" : "Send"}
        <kbd className="font-sans text-[11px] font-medium text-gousse-on-primary/60">⌘↵</kbd>
      </button>
      {onSendAndArchive ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={disabled || sending}
            render={
              <button
                type="button"
                aria-label="Send options"
                className={cn(
                  FACE,
                  "w-[30px] justify-center border-l border-gousse-on-primary/20 bg-gousse-primary-pressed/40",
                )}
              >
                <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              </button>
            }
          />
          <DropdownMenuContent side="top" align="start" className="min-w-[16rem]">
            <DropdownMenuItem onClick={onSend}>
              <Send className="h-3.5 w-3.5 text-gousse-muted" aria-hidden />
              <span className="flex-1">Send</span>
              <kbd className="font-sans text-[11px] text-gousse-subtle">⌘↵</kbd>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSendAndArchive}>
              <Archive className="h-3.5 w-3.5 text-gousse-muted" aria-hidden />
              <span className="flex-1">Send &amp; archive</span>
              <kbd className="font-sans text-[11px] text-gousse-subtle">⌘⇧↵</kbd>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </span>
  );
};
