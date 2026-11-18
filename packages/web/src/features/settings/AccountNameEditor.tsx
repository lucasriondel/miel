import { useState } from "react";
import { Input } from "@/components/ui/input";
import { NICKNAME_MAX_LENGTH } from "../../api/accountNickname.hooks";
import { SETTINGS_INPUT } from "./settingsFields";

interface Props {
  /** The nickname the box opens on; empty when there is none. */
  initial: string;
  /** Shown as the placeholder: what the mailbox is called with no nickname. */
  fallback: string;
  pending: boolean;
  /** Called with the trimmed value; an empty one clears the nickname. */
  onSave: (nickname: string | null) => void;
  onCancel: () => void;
}

/**
 * A mailbox's name line, opened for renaming: Enter saves, Escape cancels, and
 * an emptied box clears the nickname so the Google name shows again.
 */
export const AccountNameEditor = ({ initial, fallback, pending, onSave, onCancel }: Props) => {
  const [value, setValue] = useState(initial);
  return (
    <Input
      value={value}
      maxLength={NICKNAME_MAX_LENGTH}
      placeholder={fallback}
      aria-label="Mailbox nickname"
      autoComplete="off"
      spellCheck={false}
      disabled={pending}
      // Opened by a click that asked to rename, so the caret goes there.
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- see above
      autoFocus
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const next = value.trim();
          onSave(next ? next : null);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
      className={`w-full max-w-[280px] ${SETTINGS_INPUT}`}
    />
  );
};
