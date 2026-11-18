import { useEffect } from "react";
import { ChevronDown, Forward, Reply, ReplyAll, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MessageDetail } from "../../api/types";
import { useCompose } from "../compose/ComposeProvider";
import { ReplyMenuItem } from "./ReplyMenuItem";
import { replyAllLabel, replyShortcut } from "./replyShortcuts";

/**
 * The reader toolbar's Reply split button: the face is a plain Reply (the
 * window opens with the caret in the body), the caret opens Reply all — only
 * when there is someone a reply would leave out — Forward, and Draft reply with
 * AI. Its keys (R, A, F, ⇧R) are live for as long as it is on screen, which is
 * for as long as a message is open.
 */
export const ReplySplitButton = ({ message }: { message: MessageDetail }) => {
  const { openReply } = useCompose();
  const canReplyAll = message.replyAllCc.length > 0;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const shortcut = replyShortcut(e, canReplyAll);
      if (!shortcut) return;
      e.preventDefault();
      if (shortcut === "draftWithAi") openReply(message, "reply", { focusInstruction: true });
      else openReply(message, shortcut);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [message, canReplyAll, openReply]);

  return (
    <span className="inline-flex h-8 shrink-0 items-stretch overflow-hidden rounded-lg border border-gousse-line bg-gousse-panel text-gousse-ink">
      <button
        type="button"
        onClick={() => openReply(message, "reply")}
        title="Reply (R)"
        className="inline-flex items-center gap-1.5 px-2.5 text-xs font-semibold transition-colors hover:bg-gousse-hover"
      >
        <Reply className="h-3.5 w-3.5" aria-hidden />
        Reply
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="More ways to reply"
              className="inline-flex w-[26px] items-center justify-center border-l border-gousse-line bg-gousse-fill text-gousse-muted transition-colors hover:text-gousse-ink"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-[248px] max-w-[248px] rounded-xl p-1.5">
          <ReplyMenuItem
            icon={<Reply aria-hidden />}
            label="Reply"
            kbd="R"
            onClick={() => openReply(message, "reply")}
          />
          {canReplyAll ? (
            <ReplyMenuItem
              icon={<ReplyAll aria-hidden />}
              label={replyAllLabel(message.replyAllCc.length)}
              kbd="A"
              onClick={() => openReply(message, "replyAll")}
            />
          ) : null}
          <ReplyMenuItem
            icon={<Forward aria-hidden />}
            label="Forward"
            kbd="F"
            onClick={() => openReply(message, "forward")}
          />
          <DropdownMenuSeparator />
          <ReplyMenuItem
            icon={<Sparkles aria-hidden />}
            label="Draft reply with AI"
            kbd="⇧R"
            onClick={() => openReply(message, "reply", { focusInstruction: true })}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
};
