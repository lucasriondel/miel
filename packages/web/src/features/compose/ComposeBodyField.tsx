import { DraftSkeleton } from "./DraftSkeleton";

interface Props {
  body: string;
  onBodyChange: (next: string) => void;
  disabled: boolean;
  /** The AI is writing: the field gives way to placeholder lines until it lands. */
  drafting: boolean;
  /** Take the caret when the window opens. */
  focusOnMount?: boolean;
  /** A forward's body is a note above what it carries, not the message itself. */
  placeholder?: string;
}

/**
 * The message itself: plain text at 14/22 with no toolbar — what is sent is
 * what is shown. The server adds an HTML part only to carry a quote or a
 * forwarded original under it, so a formatting control would still promise
 * what the user's own text does not carry.
 */
export const ComposeBodyField = ({
  body,
  onBodyChange,
  disabled,
  drafting,
  focusOnMount,
  placeholder = "Write your message…",
}: Props) =>
  drafting ? (
    <DraftSkeleton />
  ) : (
    <div className="flex min-h-[180px] flex-1 flex-col">
      <textarea
        aria-label="Message body"
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        disabled={disabled}
        // The window was opened to answer a message: the caret goes where the
        // answer is written, as the user's own Reply asked.
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- see above
        autoFocus={focusOnMount}
        placeholder={placeholder}
        className="min-h-[140px] flex-1 resize-none bg-transparent px-5 pt-4 pb-2 text-sm leading-[22px] text-gousse-ink outline-none placeholder:text-gousse-subtle disabled:text-gousse-muted"
      />
      {body.length === 0 && !disabled ? (
        <p className="px-5 pb-3 text-xs text-gousse-disabled-ink">
          or press ⌘J to have the AI draft it
        </p>
      ) : null}
    </div>
  );
