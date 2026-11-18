import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachButton } from "./AttachButton";
import { ScheduleTimePopover } from "./ScheduleTimePopover";
import { SendButton } from "./SendButton";

interface Props {
  /** Why Send is off, or null when it is on. */
  blocker: string | null;
  sending: boolean;
  failed: boolean;
  /** The draft line: "Saving draft…", "Saved to Gmail drafts · 10:41". */
  draftLine: string | null;
  onSend: () => void;
  onSendAndArchive?: () => void;
  /** Absent when this mail cannot be scheduled. */
  onSchedule?: (at: Date) => void;
  onAttach: (files: File[]) => void;
  onDiscard: () => void;
}

/**
 * The window's actions: Send on the left with the paperclip beside it, the one
 * line of status the window talks in, and the bin. The status line is where a
 * disabled Send says why, where sending says it is sending and where the draft
 * says it is saved — one place, so the window never shows two messages at once.
 */
export const ComposeFooter = ({
  blocker,
  sending,
  failed,
  draftLine,
  onSend,
  onSendAndArchive,
  onSchedule,
  onAttach,
  onDiscard,
}: Props) => {
  const anchor = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState(false);
  const line = sending ? "Sending via Gmail…" : failed ? "Not sent" : (blocker ?? draftLine);
  return (
    <div
      ref={anchor}
      className="flex shrink-0 items-center gap-1 border-t border-gousse-fill py-3 pr-3 pl-4"
    >
      <SendButton
        disabled={blocker !== null}
        sending={sending}
        retry={failed}
        onSend={onSend}
        onSendAndArchive={onSendAndArchive}
        onSchedule={onSchedule}
        onPickScheduleTime={() => setPicking(true)}
      />
      <AttachButton onFiles={onAttach} disabled={sending} />
      <span className="flex-1" />
      {line ? (
        <span
          aria-live="polite"
          className={cn(
            "truncate px-2 text-xs",
            failed && !sending ? "font-medium text-gousse-error" : "text-gousse-subtle",
          )}
        >
          {line}
        </span>
      ) : null}
      <button
        type="button"
        aria-label="Discard"
        title="Discard (⌘⌫)"
        onClick={onDiscard}
        disabled={sending}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gousse-muted transition-[background-color,color,transform] hover:bg-gousse-high/10 hover:text-gousse-high active:scale-[0.96] disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
      {onSchedule ? (
        <ScheduleTimePopover
          open={picking}
          anchorRef={anchor}
          onPick={(at) => {
            setPicking(false);
            onSchedule(at);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
};
