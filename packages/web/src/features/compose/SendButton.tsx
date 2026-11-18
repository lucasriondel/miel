import { Archive, ChevronUp, Clock, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { presetTimeLabel, schedulePresets } from "../time/timePresets";

interface Props {
  disabled: boolean;
  sending: boolean;
  /** After a refusal the same button says "Retry send". */
  retry: boolean;
  onSend: () => void;
  /** Replies only: Send & archive (⌘⇧↵). */
  onSendAndArchive?: () => void;
  /** Schedule send at a preset time; absent when this mail cannot be held. */
  onSchedule?: (at: Date) => void;
  /** "Schedule send…": the date and time form. */
  onPickScheduleTime?: () => void;
}

const FACE =
  "inline-flex h-9 items-center gap-2 text-[13px] font-semibold text-gousse-on-primary transition-[background-color,transform] active:scale-[0.96] disabled:cursor-not-allowed";

const Kbd = ({ children }: { children: string }) => (
  <kbd className="font-sans text-[11px] text-gousse-subtle">{children}</kbd>
);

/**
 * Send, with ⌘↵ beside the word, and a caret that opens upward onto the other
 * ways to send (Compose & Reply › Send options): Send & archive for a reply —
 * the triage-shaped default for mail you are done with once answered — then
 * Schedule send…, with Tomorrow morning and Monday morning one click away and
 * the time each resolves to beside it. Disabled is a grey fill, not a faded ink
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
  const fill = disabled
    ? "bg-gousse-border-strong"
    : sending
      ? "bg-gousse-primary-hover"
      : "bg-gousse-primary hover:bg-gousse-primary-hover";
  // Read when the menu renders, so "Tue 08:00" is about the day it is opened on.
  const now = new Date();
  const presets = schedulePresets(now);
  const hasMenu = Boolean(onSendAndArchive || onSchedule);
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
      {hasMenu ? (
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
              <Kbd>⌘↵</Kbd>
            </DropdownMenuItem>
            {onSendAndArchive ? (
              <DropdownMenuItem onClick={onSendAndArchive}>
                <Archive className="h-3.5 w-3.5 text-gousse-muted" aria-hidden />
                <span className="flex-1">Send &amp; archive</span>
                <Kbd>⌘⇧↵</Kbd>
              </DropdownMenuItem>
            ) : null}
            {onSchedule ? (
              <>
                <DropdownMenuItem onClick={onPickScheduleTime}>
                  <Clock className="h-3.5 w-3.5 text-gousse-muted" aria-hidden />
                  <span className="flex-1">Schedule send…</span>
                </DropdownMenuItem>
                {presets.map((preset) => (
                  <DropdownMenuItem key={preset.id} onClick={() => onSchedule(preset.at)}>
                    <span className="w-3.5 shrink-0" aria-hidden />
                    <span className="flex-1">{preset.label}</span>
                    <span className="text-[11px] text-gousse-subtle tabular-nums">
                      {presetTimeLabel(preset.at, now)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </span>
  );
};
