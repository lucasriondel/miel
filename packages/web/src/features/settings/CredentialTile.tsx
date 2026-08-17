import type { ReactNode } from "react";
import type { Provider } from "@miel/core/providerModels";
import { PROVIDER_LABELS } from "@miel/core/providerModels";
import { CredentialTile as GousseCredentialTile } from "@/components/ui/credential-tile";
import { useCredential } from "../../api/useCredential";
import { CREDENTIAL_COPY } from "./credentialCopy";

interface Props {
  provider: Provider;
  /**
   * Where to get one. Shown while nothing is stored — once something is, the
   * tile has something truer to say in that line and says it itself.
   */
  footnote: ReactNode;
}

/**
 * One provider's credential, as a tile.
 *
 * The tile itself is gousse-ui's, which is fully controlled and knows no
 * provider catalogue — it takes `provider` as a plain string and every label as
 * a prop. What is left here is the half that is miel's: `useCredential` for the
 * lifecycle (#135) and `CREDENTIAL_COPY` for the words, joined to the design
 * system's shape. Keeping that join in a component of its own is what lets the
 * card below mount four of these without repeating either.
 *
 * The two states the tile draws — a masked hint and a way to remove it once
 * stored, a field and a save button while unset — are deliberately different
 * shapes rather than the same row with an emptier sentence, so there is no dead
 * input sitting under a key that exists. That decision lives upstream now.
 */
export const CredentialTile = ({ provider, footnote }: Props) => {
  const credential = useCredential(provider);
  const copy = CREDENTIAL_COPY[provider];

  return (
    <GousseCredentialTile
      provider={provider}
      label={PROVIDER_LABELS[provider]}
      kind={copy.kind}
      configured={credential.configured}
      hint={credential.hint}
      loading={credential.loading}
      draft={credential.draft}
      onDraftChange={credential.setDraft}
      onSave={credential.save}
      onClear={credential.clear}
      saving={credential.saving}
      clearing={credential.clearing}
      // The one place this tile reports a failure, whichever of the three it
      // came from — `useCredential` has already decided which one the user is
      // owed, so there is no second error line to keep in step with it.
      error={credential.error}
      footnote={footnote}
      fieldLabel={copy.fieldLabel}
      placeholder={copy.placeholder}
      submitLabel={`Save ${copy.noun}`}
      clearLabel={`Clear ${copy.noun}`}
    />
  );
};
