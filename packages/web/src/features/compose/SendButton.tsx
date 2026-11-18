import { useRef, useState } from "react";
import { ChevronUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SendOptionsMenu } from "./SendOptionsMenu";

interface Props {
  disabled: boolean;
  sending: boolean;
  /** After a refusal the same button says "Retry send". */
  retry: boolean;
  onSend: () => void;
  /** Replies only: Send & archive (⌘⇧↵). */
  onSendAndArchive?: () => void;
  /** Schedule send at a chosen time; absent when this mail cannot be held. */
  onSchedule?: (at: Date) => void;
  /** "Schedule send…": the date and time form. */
  onPickScheduleTime?: () => void;
}

const FACE =
  "inline-flex h-9 items-center gap-2 text-[13px] font-semibold text-gousse-on-primary transition-[background-color,transform] active:scale-[0.96] disabled:cursor-not-allowed";

/**
 * Send, with ⌘↵ beside the word, and a caret that opens upward onto the other
 * ways to send (`SendOptionsMenu`). Disabled is a grey fill, not a faded ink
 * one, and the footer says why beside it.
 */
export const SendButton = ({
  disabled,
  sending,
  retry,
  onSend,
  onSendAndArchive,
  onSchedule,
  onPickScheduleTime,
}: Props) => {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const fill = disabled
    ? "bg-gousse-border-strong"
    : sending
      ? "bg-gousse-primary-hover"
      : "bg-gousse-primary hover:bg-gousse-primary-hover";
  const hasMenu = Boolean(onSendAndArchive || onSchedule);
  return (
    <span ref={anchor} className={cn("inline-flex shrink-0 overflow-hidden rounded-[10px]", fill)}>
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
      {hasMenu ? (
        <>
          <button
            type="button"
            aria-label="Send options"
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={disabled || sending}
            onClick={() => {
              setOpen((o) => !o);
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLElement>(
                    '[role=menu][aria-label="Send options"] [role=menuitem]',
                  )
                  ?.focus(),
              );
            }}
            className={cn(
              FACE,
              "w-[30px] justify-center border-l border-gousse-on-primary/20 bg-gousse-primary-pressed/40",
            )}
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          </button>
          <SendOptionsMenu
            open={open}
            anchorRef={anchor}
            onClose={() => setOpen(false)}
            onSend={onSend}
            onSendAndArchive={onSendAndArchive}
            onSchedule={onSchedule}
            onPickScheduleTime={onPickScheduleTime}
          />
        </>
      ) : null}
    </span>
  );
};
