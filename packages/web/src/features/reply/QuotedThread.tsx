import { useState } from "react";
import type { QuoteBlock } from "../../api/composeReads.hooks";
import { unquote } from "./quoteText";

interface Props {
  /** What `send-reply` will append, as the server answered it; null while loading. */
  quote: QuoteBlock | null;
  /** The quote as trimmed here, or null while untouched. */
  quotedText: string | null;
  onTrim: (next: string) => void;
  disabled: boolean;
}

/**
 * The message being answered, under the reply's body — collapsed to a pill so
 * the draft gets the room. It is sent either way (the server appends it);
 * expanding is for reading it or trimming it, and what is trimmed here is what
 * goes. Emptying it sends the reply without one.
 */
export const QuotedThread = ({ quote, quotedText, onTrim, disabled }: Props) => {
  const [open, setOpen] = useState(false);
  if (!quote) return null;
  const text = quotedText ?? unquote(quote);
  if (!open) {
    return (
      <div className="shrink-0 px-5 pb-3">
        <button
          type="button"
          aria-label="Show quoted text"
          title="Show quoted text"
          onClick={() => setOpen(true)}
          className="inline-flex h-4 items-center rounded-full bg-gousse-fill px-2 text-[11px] leading-none font-bold tracking-[0.12em] text-gousse-muted hover:bg-gousse-border hover:text-gousse-ink"
        >
          •••
        </button>
      </div>
    );
  }
  return (
    <div className="shrink-0 px-5 pb-3">
      <div className="border-l-2 border-gousse-line pl-3">
        <p className="text-xs leading-[18px] text-gousse-subtle">{quote.attribution}</p>
        <textarea
          aria-label="Quoted text"
          value={text}
          onChange={(e) => onTrim(e.target.value)}
          disabled={disabled}
          rows={Math.min(Math.max(text.split("\n").length, 2), 10)}
          className="mt-1 w-full resize-none bg-transparent text-[13px] leading-5 text-gousse-muted outline-none"
        />
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-1.5 text-xs font-semibold text-gousse-muted hover:text-gousse-ink"
      >
        Hide quoted text
      </button>
    </div>
  );
};
