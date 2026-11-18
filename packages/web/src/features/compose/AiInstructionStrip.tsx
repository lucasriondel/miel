import { useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { AiStripShell } from "./AiStripShell";
import { RefineChips } from "./RefineChips";
import { StripButton } from "./StripButton";
import type { AiStatus } from "./useComposeAi";

interface Props {
  status: AiStatus;
  prompt: string;
  onPromptChange: (next: string) => void;
  draftedFrom: string | null;
  error: unknown;
  /** Draft (or redraft) from an instruction. */
  onRun: (instruction: string, force?: boolean) => void;
  /** A refinement chip: the model edits the current draft; `shown` is the instruction chain. */
  onRefine: (refinement: string, shown: string) => void;
  onStop: () => void;
  onKeepMine: () => void;
  /** Sending or sent: the strip stays but cannot start anything. */
  locked: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Take the caret when the window opens (Draft reply with AI). */
  focusOnMount: boolean;
}

const PLACEHOLDER = "Tell the AI what to write — “accept, but ask for 9pm”";

/**
 * Draft with AI — the instruction strip (the redesign's "5 · AI assist").
 *
 * One band above the footer that walks through its lifecycle in place: an
 * instruction field, "Drafting from …" with Stop while the request runs, then
 * "Drafted from … · edit freely" with Regenerate and the refine chips. The two
 * guard rails are states of the same band: regenerating over a body the user
 * edited asks first, and a failure says the body was left alone.
 */
export const AiInstructionStrip = ({
  status,
  prompt,
  onPromptChange,
  draftedFrom,
  error,
  onRun,
  onRefine,
  onStop,
  onKeepMine,
  locked,
  inputRef,
  focusOnMount,
}: Props) => {
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(false);
  const run = (instruction: string, force?: boolean) => {
    setEditing(false);
    onRun(instruction, force);
  };

  if (status === "generating") {
    return (
      <AiStripShell tone="honey">
        <Loader2 className="animate-spin" aria-hidden />
        <output className="min-w-0 flex-1 truncate">Drafting from “{prompt}”…</output>
        <StripButton label="Stop" kbd="Esc" onClick={onStop} />
      </AiStripShell>
    );
  }

  if (status === "confirm") {
    return (
      <AiStripShell tone="honey">
        <Sparkles aria-hidden />
        <span className="min-w-0 flex-1 truncate text-gousse-ink">
          Replace the body you edited with a new draft?
        </span>
        <button
          type="button"
          onClick={onKeepMine}
          className="h-7 shrink-0 rounded-lg px-2.5 text-xs font-semibold text-gousse-muted hover:text-gousse-ink"
        >
          Keep mine
        </button>
        <StripButton label="Replace" kbd="⌘J" onClick={() => run(prompt, true)} />
      </AiStripShell>
    );
  }

  if (status === "failed") {
    return (
      <AiStripShell tone="error">
        <AlertCircle aria-hidden />
        <span role="alert" className="min-w-0 flex-1 truncate" title={apiErrorMessage(error)}>
          Couldn’t draft — {apiErrorMessage(error).replace(/\.$/, "")}. Your body is unchanged.
        </span>
        <StripButton label="Retry" kbd="⌘J" onClick={() => run(prompt, true)} disabled={locked} />
      </AiStripShell>
    );
  }

  if (status === "unavailable") {
    return (
      <AiStripShell tone="neutral">
        <AlertCircle className="text-gousse-muted" aria-hidden />
        <span
          role="alert"
          className="min-w-0 flex-1 truncate text-gousse-quiet"
          title={apiErrorMessage(error)}
        >
          Drafting is off — {apiErrorMessage(error)}
        </span>
        <Link
          to="/settings"
          className="inline-flex h-7 shrink-0 items-center rounded-lg border border-gousse-line bg-gousse-panel px-2.5 text-xs font-semibold text-gousse-ink hover:bg-gousse-hover"
        >
          Open Settings
        </Link>
      </AiStripShell>
    );
  }

  if (status === "drafted" && !editing && draftedFrom !== null) {
    return (
      <>
        <AiStripShell tone="honey">
          <Sparkles aria-hidden />
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="min-w-0 flex-1 truncate text-left"
            title="Edit the instruction"
          >
            Drafted from “{draftedFrom}” · edit freely
          </button>
          <StripButton
            label="Regenerate"
            kbd="⌘J"
            onClick={() => run(prompt || draftedFrom)}
            disabled={locked}
          />
        </AiStripShell>
        {locked ? null : (
          <RefineChips
            disabled={locked}
            onRefine={(refinement) => {
              const next = `${(prompt || draftedFrom).replace(/[.\s]+$/, "")}. ${refinement}`;
              setEditing(false);
              onRefine(refinement, next);
            }}
            onAddDetail={() => {
              onPromptChange(`${(prompt || draftedFrom).replace(/[.\s]+$/, "")}. `);
              setEditing(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          />
        )}
      </>
    );
  }

  const ready = prompt.trim().length > 0 && !locked;
  return (
    <AiStripShell tone="neutral">
      <Sparkles className="text-gousse-muted" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        aria-label="Instruction for the AI"
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            if (ready) run(prompt);
          }
        }}
        disabled={locked}
        // Opt-in: only when the user's own action was "draft this with AI".
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- see above
        autoFocus={focusOnMount}
        placeholder={PLACEHOLDER}
        className="min-w-0 flex-1 bg-transparent text-gousse-ink outline-none placeholder:text-gousse-subtle"
      />
      <StripButton
        label={draftedFrom ? "Regenerate" : "Draft"}
        kbd="⌘J"
        onClick={() => run(prompt)}
        disabled={!ready}
        primary={focused && ready}
      />
    </AiStripShell>
  );
};
