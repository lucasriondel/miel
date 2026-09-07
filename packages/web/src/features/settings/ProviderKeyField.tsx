import { SecretField } from "@/components/ui/secret-field";
import { useCredential } from "../../api/useCredential";
import { CREDENTIAL_COPY } from "./credentialCopy";
import type { CredentialProvider } from "../../api/types";

interface Props {
  provider: CredentialProvider;
  submitLabel: string;
  /** Called once the key is stored — the model row uses it to save the switch. */
  onSaved?: () => void;
}

/**
 * A vendor's key, typed somewhere other than its tile: inline in a model row
 * when the task points at a vendor whose key has gone missing, which is what
 * makes "put this back" a single action rather than a trip to another card.
 *
 * The credential itself is `useCredential`'s (#135) — the same hook the tile
 * uses, so the draft is emptied the moment the server has the value here too,
 * and a refused key is reported the same way in both places. That is the whole
 * of what this component adds: the row it sits in mounts it conditionally, and
 * a hook cannot be called conditionally.
 *
 * A refused key is reported here rather than by whatever contains the field
 * (#116). The containing row cannot see a failure it does not own, which is how
 * the save error came to be dropped on the floor in the first place.
 */
export const ProviderKeyField = ({ provider, submitLabel, onSaved }: Props) => {
  const credential = useCredential(provider, { onSaved });

  return (
    <SecretField
      value={credential.draft}
      onChange={credential.setDraft}
      onSubmit={credential.save}
      label={CREDENTIAL_COPY[provider].fieldLabel}
      placeholder={CREDENTIAL_COPY[provider].placeholder}
      submitLabel={submitLabel}
      pending={credential.saving}
      error={credential.error}
    />
  );
};
