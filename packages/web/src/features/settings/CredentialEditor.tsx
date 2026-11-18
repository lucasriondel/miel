import { Input } from "@/components/ui/input";
import { AppButton } from "../../components/AppButton";
import { Spinner } from "@/components/ui/spinner";
import type { Credential } from "../../api/useCredential";
import { CredentialSource } from "./CredentialSource";
import type { CredentialCopy } from "./credentialCopy";
import { SETTINGS_INPUT } from "./settingsFields";

interface Props {
  credential: Credential;
  copy: CredentialCopy;
  /** Shut the editor without saving. */
  onCancel: () => void;
}

/**
 * The open "Add key" editor of a provider row: a write-only field, Save and
 * Cancel on its line, where to get one under it.
 *
 * Write-only like the registry's `SecretField` it replaces here, and for its
 * reasons: `type="password"`, no autocomplete, no spellcheck, a monospace value,
 * and Enter commits — a user who has just pasted a key expects it to. The draft
 * is `useCredential`'s, so it is emptied the moment the server has the value
 * and kept when the value is refused.
 */
export const CredentialEditor = ({ credential, copy, onCancel }: Props) => {
  const empty = credential.draft.trim().length === 0;
  return (
    <div className="flex flex-col gap-1.5 sm:pl-10">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="password"
          value={credential.draft}
          placeholder={`Paste your ${copy.fieldLabel} (${copy.placeholder})`}
          aria-label={copy.fieldLabel}
          autoComplete="off"
          spellCheck={false}
          disabled={credential.saving}
          // The editor opens on a click that asked for it, so the caret goes
          // where the paste is about to land.
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- see above
          autoFocus
          onChange={(e) => credential.setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              credential.save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          className={`min-w-0 flex-1 font-mono placeholder:font-sans ${SETTINGS_INPUT}`}
        />
        <AppButton
          tone="primary"
          className="h-8 px-3.5"
          disabled={credential.saving || empty}
          onClick={credential.save}
        >
          {credential.saving ? <Spinner size={12} /> : null}
          Save {copy.noun}
        </AppButton>
        <AppButton tone="ghost" className="h-8" disabled={credential.saving} onClick={onCancel}>
          Cancel
        </AppButton>
      </div>
      <CredentialSource copy={copy} />
    </div>
  );
};
