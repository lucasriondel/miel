import { usePopover } from "../hooks/usePopover";
import type { PendingExistingLabelSuggestion, PendingNewLabelSuggestion } from "../api/types";
import { PopoverPanel, PopoverTitle } from "./PopoverPanel";

interface Props {
  existingSuggestions: PendingExistingLabelSuggestion[];
  newSuggestions: PendingNewLabelSuggestion[];
  disabled?: boolean;
  onApplyExisting: (s: PendingExistingLabelSuggestion) => void;
  onApplyNew: (s: PendingNewLabelSuggestion) => void;
}

export const MobileSuggestionsBadge = ({
  existingSuggestions,
  newSuggestions,
  disabled,
  onApplyExisting,
  onApplyNew,
}: Props) => {
  const { open, toggle, close, ref, panelRef } = usePopover();
  const count = existingSuggestions.length + newSuggestions.length;
  if (count === 0) return null;
  const label = `${count} suggested label${count === 1 ? "" : "s"}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={label}
        aria-label={`Show ${label}`}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }}
        className="inline-flex items-center gap-1 rounded-full border border-gousse-accent/50 bg-gousse-accent/15 px-2 py-0.5 text-xs font-bold text-gousse-accent sm:px-2.5 sm:py-1 shadow-gousse-sm transition-all active:scale-[0.96] hover:bg-gousse-accent/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span aria-hidden="true" className="text-sm leading-none">
          +
        </span>
        {count}
      </button>
      <PopoverPanel open={open} anchorRef={ref} panelRef={panelRef} align="right">
        <PopoverTitle>Suggested labels</PopoverTitle>
        {existingSuggestions.map((s) => (
          <SuggestionMenuItem
            key={`existing:${s.labelId}`}
            name={s.name}
            kind="existing"
            disabled={disabled}
            onApply={() => {
              onApplyExisting(s);
              close();
            }}
          />
        ))}
        {newSuggestions.map((s) => (
          <SuggestionMenuItem
            key={`new:${s.suggestionId}`}
            name={s.name}
            kind="new"
            disabled={disabled}
            onApply={() => {
              onApplyNew(s);
              close();
            }}
          />
        ))}
      </PopoverPanel>
    </div>
  );
};

interface SuggestionMenuItemProps {
  name: string;
  kind: "existing" | "new";
  disabled?: boolean;
  onApply: () => void;
}

const SuggestionMenuItem = ({ name, kind, disabled, onApply }: SuggestionMenuItemProps) => {
  const isNew = kind === "new";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onApply();
      }}
      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-gousse-muted transition-[background,transform] duration-150 active:scale-[0.98] hover:bg-gousse-line/40 hover:text-gousse-ink disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span aria-hidden="true" className={isNew ? "text-gousse-accent" : "text-gousse-muted"}>
        {isNew ? "+" : "?"}
      </span>
      <span className="truncate font-medium text-gousse-ink">{name}</span>
    </button>
  );
};
