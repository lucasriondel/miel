import { Reply, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onReply: () => void;
  onDraftWithClaude: () => void;
}

/**
 * The reply block at rest, under the open message: two pills and nothing else
 * (#91, redesigned). Reply opens the compose window plain; Draft with AI asks
 * for a draft right here, in the reader's draft card.
 *
 * The vendored `Button` is already a pill that presses at `active:scale-[0.96]`;
 * the design's 40px height and 13px semibold label are added here, and that
 * height is also §5's floor.
 */
export const ReplyPills = ({ onReply, onDraftWithClaude }: Props) => (
  <div className="flex flex-wrap items-center gap-2">
    <Button
      type="button"
      variant="primary"
      className="min-h-10 gap-2 bg-gousse-primary pr-[18px] pl-3.5 text-[13px] font-semibold text-gousse-on-primary hover:bg-gousse-primary-hover active:bg-gousse-primary-pressed"
      onClick={onReply}
    >
      <Reply className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Reply
    </Button>
    <Button
      type="button"
      variant="ghost"
      className="min-h-10 gap-2 pr-[18px] pl-3.5 text-[13px] font-semibold text-gousse-primary hover:bg-gousse-fill active:bg-gousse-line"
      onClick={onDraftWithClaude}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Draft with AI
    </Button>
  </div>
);
