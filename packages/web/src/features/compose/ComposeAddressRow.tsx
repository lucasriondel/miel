import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ContactSuggestion } from "../../api/composeReads.hooks";
import { ComposeFieldRow } from "./ComposeFieldRow";
import { RecipientChip } from "./RecipientChip";
import { optionId, RecipientSuggestions } from "./RecipientSuggestions";
import { commitAll, looksLikeAddress, recipientLabel, splitTyped } from "./recipients";
import { useRecipientSuggestions } from "./useRecipientSuggestions";

interface Props {
  label: "To" | "Cc" | "Bcc";
  /** The mailbox it is sent from, whose correspondents are suggested. */
  accountId: string;
  entries: string[];
  names: Readonly<Record<string, string>>;
  onChange: (next: string[]) => void;
  /** A suggestion carries a name the chip can show. */
  onName: (email: string, name: string) => void;
  disabled: boolean;
  /** The Cc / Bcc switches, on the To row only. */
  trailing?: ReactNode;
  /** Take the caret when the window opens. */
  focusOnMount?: boolean;
}

/** More than this many chips fold to the first two and a "+N more" while the row is not focused. */
const FOLD_AT = 3;

/**
 * One address list as chips plus the text being typed (#96, redesigned), with
 * the people this mailbox has written to suggested under it.
 *
 * What is typed is never rewritten under the caret: it turns into chips only on
 * the user's own commit — a comma, semicolon or newline typed or pasted, Enter,
 * or leaving the field — and until then stays exactly as typed. A chip that is
 * not an address stays a chip, in red, and keeps Send off until it is fixed;
 * pressing it puts its text back in the field.
 *
 * The field is an ARIA combobox: while suggestions show, the arrows move the
 * highlight, Enter or Tab takes it and Escape hides the list; a comma still
 * commits exactly what was typed, so a suggestion never overrides an address
 * someone wrote out in full.
 */
export const ComposeAddressRow = ({
  label,
  accountId,
  entries,
  names,
  onChange,
  onName,
  disabled,
  trailing,
  focusOnMount,
}: Props) => {
  const id = useId();
  const listId = `${id}-suggestions`;
  const input = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const suggest = useRecipientSuggestions({ accountId, text, exclude: entries, focused });

  const add = (more: string[]) => {
    if (more.length > 0) onChange([...entries, ...more]);
  };

  const onType = (value: string) => {
    const { committed, rest } = splitTyped(value);
    add(committed);
    setText(committed.length > 0 ? rest : value);
  };

  const commit = () => {
    add(commitAll(text));
    setText("");
  };

  const pick = (contact: ContactSuggestion) => {
    if (contact.name) onName(contact.email, contact.name);
    add([contact.email]);
    setText("");
    input.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (suggest.open) {
      const chosen = suggest.suggestions[suggest.active];
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        suggest.move(e.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && chosen && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        pick(chosen);
        return;
      }
      if (e.key === "Escape") {
        // The list goes; the window, which also listens for Escape, stays.
        e.preventDefault();
        suggest.dismiss();
        return;
      }
    }
    if (e.key === "Enter") {
      commit();
      // A bare Enter only commits; with ⌘ it also sends, so let that one bubble.
      if (!e.metaKey && !e.ctrlKey) e.preventDefault();
    } else if (e.key === "Backspace" && text.length === 0 && entries.length > 0) {
      onChange(entries.slice(0, -1));
    }
  };

  const remove = (index: number) => onChange(entries.filter((_, i) => i !== index));
  const edit = (index: number) => {
    remove(index);
    setText(entries[index] ?? "");
    input.current?.focus();
  };

  const folded = !focused && entries.length > FOLD_AT;
  const shown = folded ? entries.slice(0, 2) : entries;
  const invalid = entries.find((entry) => !looksLikeAddress(entry));

  return (
    <>
      <ComposeFieldRow label={label} htmlFor={id}>
        <div
          ref={area}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
          }}
        >
          {shown.map((entry, index) => (
            <RecipientChip
              key={`${entry}-${index}`}
              label={recipientLabel(entry, names)}
              invalid={!looksLikeAddress(entry)}
              disabled={disabled}
              onRemove={() => remove(index)}
              onEdit={() => edit(index)}
            />
          ))}
          {folded ? (
            <button
              type="button"
              onClick={() => input.current?.focus()}
              className="h-6 rounded-full bg-gousse-hover px-2 text-xs font-medium text-gousse-muted hover:text-gousse-ink"
            >
              +{entries.length - shown.length} more
            </button>
          ) : null}
          <input
            ref={input}
            id={id}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggest.open}
            aria-controls={suggest.open ? listId : undefined}
            aria-activedescendant={suggest.open ? optionId(listId, suggest.active) : undefined}
            value={text}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            // Only a new mail asks for its recipients first, and only when it
            // was just opened by the user's own Compose.
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- see above
            autoFocus={focusOnMount}
            placeholder={entries.length === 0 && label === "To" ? "Recipients" : undefined}
            className="h-6 min-w-[6rem] flex-1 bg-transparent text-[13px] text-gousse-ink outline-none placeholder:text-gousse-subtle"
          />
        </div>
        {trailing}
      </ComposeFieldRow>
      <RecipientSuggestions
        listId={listId}
        open={suggest.open}
        anchorRef={area}
        panelRef={panel}
        suggestions={suggest.suggestions}
        active={suggest.active}
        onPick={pick}
        onHover={suggest.setActive}
        onEscape={suggest.dismiss}
      />
      {invalid ? (
        <p
          role="alert"
          className="shrink-0 py-1.5 pr-5 pl-[76px] text-xs leading-[18px] text-gousse-error"
        >
          “{invalid}” isn’t an email address. Send stays off until it’s fixed — press the chip to
          edit it.
        </p>
      ) : null}
    </>
  );
};
