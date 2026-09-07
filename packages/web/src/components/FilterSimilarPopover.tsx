import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Send } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAnchoredPosition } from "../hooks/useAnchoredPosition";

interface Props {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  isPending: boolean;
  onSubmit: (prompt: string) => void;
}

/**
 * Popover for the "Filter similar" row action: a short instruction box whose
 * text is passed to Claude Code as a steer for the generated filter suggestion.
 * Portalled to `document.body` and fixed-positioned so it escapes the message
 * list's `overflow-hidden` clip, matching {@link PopoverPanel}.
 */
export const FilterSimilarPopover = ({ open, anchorRef, panelRef, isPending, onSubmit }: Props) => {
  const pos = useAnchoredPosition(anchorRef, open, { panelRef });
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
    else setPrompt("");
  }, [open]);

  if (!open || !pos) return null;

  const submit = () => {
    if (isPending) return;
    onSubmit(prompt.trim());
  };

  return createPortal(
    <div
      ref={panelRef as RefObject<HTMLDivElement>}
      style={{ position: "fixed", top: pos.top, right: pos.right }}
      className="z-[70] flex w-72 max-w-[calc(100vw-1rem)] flex-col gap-2 rounded-lg border border-gousse-line bg-gousse-panel p-3 shadow-gousse-lg"
    >
      <p className="text-xs font-medium text-gousse-ink">Filter similar</p>
      <Textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Optional: steer the AI, e.g. 'label these as Receipts'"
        rows={3}
        disabled={isPending}
        className="resize-none bg-gousse-bg placeholder:text-gousse-muted disabled:opacity-70"
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gousse-muted">
          {isPending ? "Asking the AI…" : "⌘↵ to send"}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-gousse-ink px-2.5 py-1.5 text-xs font-medium text-gousse-bg transition-[transform,background-color] active:scale-[0.96] hover:bg-gousse-ink/90 disabled:cursor-default disabled:bg-gousse-muted"
        >
          {isPending ? <Spinner size={12} /> : <Send className="h-3.5 w-3.5" aria-hidden />}
          Send
        </button>
      </div>
    </div>,
    document.body,
  );
};
