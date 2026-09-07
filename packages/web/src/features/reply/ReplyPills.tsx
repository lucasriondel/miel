import { Reply, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onReply: () => void;
  onDraftWithClaude: () => void;
}

/**
 * The reply block at rest: two pills and nothing else (issue #91). Both open the
 * same composer in place — no route change, no modal — and differ only in where
 * they land the caret, which is why they are one component and not two features.
 *
 * The vendored `Button` is already a pill that presses at `active:scale-[0.96]`;
 * what it does not carry is §5's 40px floor, so `min-h-10` is added here rather
 * than at the primitive, which the whole app shares.
 */
export const ReplyPills = ({ onReply, onDraftWithClaude }: Props) => (
  <div className="flex flex-wrap items-center gap-2">
    <Button type="button" variant="primary" className="min-h-10" onClick={onReply}>
      <Reply className="h-4 w-4 shrink-0" aria-hidden />
      Reply
    </Button>
    <Button type="button" variant="ghost" className="min-h-10" onClick={onDraftWithClaude}>
      <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
      Draft with AI
    </Button>
  </div>
);
