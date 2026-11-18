import type { RefObject } from "react";
import type { ContactSuggestion } from "../../api/composeReads.hooks";
import { ComposePopover } from "./ComposePopover";
import { SuggestionOption } from "./SuggestionOption";

interface Props {
  listId: string;
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  suggestions: readonly ContactSuggestion[];
  active: number;
  onPick: (contact: ContactSuggestion) => void;
  onHover: (index: number) => void;
  onEscape: () => void;
}

/** The DOM id of one option, for the field's `aria-activedescendant`. */
export const optionId = (listId: string, index: number) => `${listId}-option-${index}`;

/**
 * "People you've emailed" under an address field: the listbox half of the
 * field's combobox. The caret never leaves the field — the arrows move the
 * highlight, Enter or Tab takes it, a comma still commits exactly what was
 * typed — so this list is never focused, only pointed at.
 */
export const RecipientSuggestions = ({
  listId,
  open,
  anchorRef,
  panelRef,
  suggestions,
  active,
  onPick,
  onHover,
  onEscape,
}: Props) => (
  <ComposePopover
    open={open}
    anchorRef={anchorRef}
    panelRef={panelRef}
    onEscape={onEscape}
    className="w-[min(20rem,calc(100vw-2rem))]"
  >
    {/* A combobox's popup: the field keeps focus and drives it (`aria-activedescendant`), so a
        native select or datalist — which would take focus — cannot be the list. */}
    {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- see above */}
    <ul id={listId} role="listbox" aria-label="Suggested recipients" className="flex flex-col">
      {suggestions.map((contact, index) => (
        <SuggestionOption
          key={contact.email}
          id={optionId(listId, index)}
          contact={contact}
          active={index === active}
          onPick={() => onPick(contact)}
          onHover={() => onHover(index)}
        />
      ))}
    </ul>
    <p className="mt-1 border-t border-gousse-fill px-2 pt-1.5 pb-0.5 text-[11px] text-gousse-subtle">
      ↑↓ to pick · ↵ or comma to add
    </p>
  </ComposePopover>
);
