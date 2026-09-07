import { Plus } from "lucide-react";
import {
  useApplyAllSuggestions,
  useApplyLabelSuggestion,
  useDismissAllSuggestions,
} from "../api/mutations";
import type { PendingExistingLabelSuggestion, PendingNewLabelSuggestion } from "../api/types";
import { usePopover } from "../hooks/usePopover";
import { PopoverPanel, PopoverTitle } from "./PopoverPanel";

interface Props {
  accountId: string;
  gmailMessageId: string;
  triageId: string | null;
  existingSuggestions: PendingExistingLabelSuggestion[];
  newSuggestions: PendingNewLabelSuggestion[];
}

/**
 * Every label Claude suggested for a row, as one round button (req. 6).
 *
 * The suggestions used to sit inline as one badge each, which is what made the
 * subject start at a different x on every row: a message with three suggestions
 * pushed it three badges further along than its neighbour. They collapse to a
 * single trigger instead, and the deciding happens in the popover, where there
 * is room to name each label and say whether it exists yet.
 *
 * The trigger is an 18px disc inside a rainbow hairline carrying one `+`. It
 * says there is something to add and refuses to say more — which labels, how
 * many, existing or new is all the popover's job. It used to carry the count
 * and a Sparkles glyph, and both were dropped: the edge already says "AI", so a
 * sparkle said it twice while leaving the button silent about what pressing it
 * does, and a number that could be 1 or 4 changed the trigger's width for a
 * fact nobody acts on without opening it anyway. Constant width is what lets it
 * live in the label group (see `MessageRowLabels`).
 *
 * The count survives where it is read rather than seen: `aria-label` still says
 * how many, so nothing is lost to a screen reader by the glyph saying less.
 */
export const SuggestionPill = ({
  accountId,
  gmailMessageId,
  triageId,
  existingSuggestions,
  newSuggestions,
}: Props) => {
  const { open, toggle, close, ref, panelRef } = usePopover();
  const applyOne = useApplyLabelSuggestion();
  const applyAll = useApplyAllSuggestions();
  const dismissAll = useDismissAllSuggestions();

  const count = existingSuggestions.length + newSuggestions.length;
  // No triage is no suggestion to act on: the ids the routes take are that
  // run's, so there is nothing to send and nothing to show.
  if (count === 0 || !triageId) return null;

  const busy = applyOne.isPending || applyAll.isPending || dismissAll.isPending;
  const label = `${count} suggested label${count === 1 ? "" : "s"}`;

  const applyExisting = (s: PendingExistingLabelSuggestion) => {
    applyOne.mutate({
      accountId,
      gmailMessageId,
      triageId,
      kind: "existing",
      labelId: s.labelId,
      name: s.name,
      colorBg: s.colorBg,
      colorFg: s.colorFg,
    });
  };

  const applyNew = (s: PendingNewLabelSuggestion) => {
    applyOne.mutate({
      accountId,
      gmailMessageId,
      triageId,
      kind: "new",
      suggestionId: s.suggestionId,
    });
  };

  // Both batch verbs name the whole pending set, so the request is one call
  // rather than a loop — the pill empties once instead of counting down.
  const batchInput = {
    accountId,
    gmailMessageId,
    triageId,
    existingLabelIds: existingSuggestions.map((s) => s.labelId),
    newSuggestionIds: newSuggestions.map((s) => s.suggestionId),
  };

  return (
    <div ref={ref} className="relative shrink-0">
      {/* The rainbow is the host's 1px of padding and the face sits inside it;
          `data-open` is what keeps it turning while the panel is up. Both are
          styled in `index.css` — a gradient border with a radius is not a
          utility. */}
      <span className="suggestion-edge" data-open={open}>
        <button
          type="button"
          title={label}
          aria-label={`Show ${label}`}
          aria-expanded={open}
          disabled={busy}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle();
          }}
          className="suggestion-face relative flex h-[1.125rem] w-[1.125rem] items-center justify-center rounded-full text-gousse-accent active:scale-[0.95] disabled:cursor-progress"
        >
          <Plus className="h-[0.6875rem] w-[0.6875rem]" strokeWidth={3} aria-hidden />
        </button>
      </span>
      <PopoverPanel open={open} anchorRef={ref} panelRef={panelRef} align="left">
        <PopoverTitle>Suggested labels</PopoverTitle>
        {existingSuggestions.map((s) => (
          <SuggestionItem
            key={`existing:${s.labelId}`}
            name={s.name}
            kind="existing"
            colorBg={s.colorBg}
            colorFg={s.colorFg}
            disabled={busy}
            onApply={() => {
              applyExisting(s);
              close();
            }}
          />
        ))}
        {newSuggestions.map((s) => (
          <SuggestionItem
            key={`new:${s.suggestionId}`}
            name={s.name}
            kind="new"
            disabled={busy}
            onApply={() => {
              applyNew(s);
              close();
            }}
          />
        ))}
        <div className="mt-2 flex gap-1.5 border-t border-gousse-line pt-2">
          <FootButton
            label="Dismiss all"
            disabled={busy}
            onClick={() => {
              dismissAll.mutate(batchInput);
              close();
            }}
          />
          <FootButton
            label="Apply all"
            primary
            disabled={busy}
            onClick={() => {
              applyAll.mutate(batchInput);
              close();
            }}
          />
        </div>
      </PopoverPanel>
    </div>
  );
};

interface ItemProps {
  name: string;
  kind: "existing" | "new";
  /** Gmail's own colours, which only an existing label has. */
  colorBg?: string | null;
  colorFg?: string | null;
  disabled?: boolean;
  onApply: () => void;
}

/** One suggestion, saying which label it is and whether miel would have to
 *  create it. Pressing the row applies that one — the two footer buttons are
 *  the only way to act on the set.
 *
 *  An existing label is drawn as the pill it already is elsewhere, in Gmail's
 *  own colours, so the popover shows the thing that would be attached rather
 *  than a description of it. A new one has no colour yet — Gmail assigns one
 *  when the label is created — so it stays plain text, and the New chip is what
 *  says so. */
const SuggestionItem = ({ name, kind, colorBg, colorFg, disabled, onApply }: ItemProps) => {
  const isNew = kind === "new";
  const action = isNew ? `Apply new label "${name}"` : `Apply suggested label "${name}"`;
  return (
    <button
      type="button"
      disabled={disabled}
      // Named for what pressing it does: the text inside is the label's name
      // plus the Existing/New chip, which announces as "Keep/Orders Existing"
      // and never says that this applies it.
      aria-label={action}
      title={action}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onApply();
      }}
      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-[background,transform] duration-150 active:scale-[0.98] hover:bg-gousse-line/40 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex min-w-0 flex-1 items-center">
        {isNew ? (
          <span className="min-w-0 truncate font-medium text-gousse-ink">{name}</span>
        ) : (
          <SuggestionLabelPill name={name} colorBg={colorBg} colorFg={colorFg} />
        )}
      </span>
      <span
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          isNew ? "bg-gousse-accent/20 text-gousse-accent" : "bg-gousse-line/60 text-gousse-muted"
        }`}
      >
        {isNew ? "New" : "Existing"}
      </span>
    </button>
  );
};

interface FootButtonProps {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const FootButton = ({ label, primary, disabled, onClick }: FootButtonProps) => (
  <button
    type="button"
    disabled={disabled}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    }}
    className={`flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 ${
      primary
        ? "border-gousse-accent/40 bg-gousse-accent/15 text-gousse-accent hover:bg-gousse-accent/25"
        : "border-gousse-line text-gousse-muted hover:text-gousse-ink"
    }`}
  >
    {label}
  </button>
);

interface SuggestionLabelPillProps {
  name: string;
  colorBg?: string | null;
  colorFg?: string | null;
}

/** The suggested label wearing its own colours. Same chassis as the row's
 *  `RowLabel` — Gmail's pair where it has one, the neutral fill where it does
 *  not — so a label reads the same before it is applied as after. */
const SuggestionLabelPill = ({ name, colorBg, colorFg }: SuggestionLabelPillProps) => {
  const hasColor = Boolean(colorBg || colorFg);
  return (
    <span
      style={
        hasColor
          ? { backgroundColor: colorBg ?? undefined, color: colorFg ?? undefined }
          : undefined
      }
      className={`inline-flex min-w-0 items-center truncate rounded-full px-[0.5625rem] py-px text-[11px] font-bold shadow-gousse-sm ${
        hasColor ? "" : "bg-gousse-line/50 text-gousse-muted"
      }`}
    >
      {name}
    </span>
  );
};
