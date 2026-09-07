import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "../../api/apiErrorMessage";

interface Props {
  prompt: string;
  onPromptChange: (next: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  /**
   * A generate *or* a send is in flight. Both lock: a second generate would
   * overwrite the body the send is reading from.
   */
  isBusy: boolean;
  /** Relabels the action, since a second run replaces what is on screen. */
  hasDraft: boolean;
  error: unknown;
  /** Set when `Draft with AI` opened the window, so the caret lands here. */
  autoFocus: boolean;
}

/**
 * The AI half of the reply window, carried over from the old inline composer
 * (#91) into the floating one (#96): the instruction, the action that fills the
 * body from it, and the failure when it does not.
 *
 * A section inside the window rather than a card of its own — the window is
 * already a `rounded-3xl` surface and repeating that corner on a child is what
 * DESIGN.md §3 rules out — so it separates with a hairline instead.
 *
 * Presentational on purpose: `ReplyComposer` owns the mutation, which keeps
 * every state this section can be in reachable from a plain render.
 */
export const ReplyPromptSection = ({
  prompt,
  onPromptChange,
  onGenerate,
  isGenerating,
  isBusy,
  hasDraft,
  error,
  autoFocus,
}: Props) => {
  const canGenerate = prompt.trim().length > 0 && !isBusy;
  return (
    <div className="flex flex-col gap-2 border-t border-gousse-line/60 pt-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gousse-muted">Instruction for the AI</span>
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="e.g. Decline politely; I'm on vacation until June."
          rows={2}
          disabled={isGenerating}
          // Opt-in, and only when the window was just opened from the sparkle
          // pill: the caller passes `autoFocus` exactly when the user's own
          // action was "draft this with AI", so the focus move is the one they
          // asked for rather than one that ambushes a page they landed on.
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- see above
          autoFocus={autoFocus}
        />
      </label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          className="min-h-10"
          disabled={!canGenerate}
          onClick={onGenerate}
        >
          {isGenerating ? <Spinner /> : null}
          {hasDraft ? "Regenerate" : "Generate"}
        </Button>
        {isGenerating ? (
          <span className="text-xs text-gousse-muted">Asking the AI for a draft…</span>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-gousse-high">Generation failed: {apiErrorMessage(error)}</p>
      ) : null}
    </div>
  );
};
