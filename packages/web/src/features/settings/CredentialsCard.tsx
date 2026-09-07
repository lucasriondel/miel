import { PROVIDERS } from "@miel/core/providerModels";
import { CredentialGrid } from "@/components/ui/credential-tile";
import { CREDENTIAL_COPY } from "./credentialCopy";
import { CredentialTile } from "./CredentialTile";

/**
 * Every AI credential, one tile per provider.
 *
 * They used to be two subsections — a read-only pill for the local provider's
 * token and a card of vendor keys — which made one credential look like a
 * different category of setting from the other three (#110). A grid of peers is
 * what the storage says, so it is what this says: `encrypted_secrets` holds one
 * row per credential, none of them privileged over the others.
 *
 * A grid rather than the stack that replaced those subsections, because a stack
 * still implies an order, and the only order here is the catalogue's. The grid
 * is gousse-ui's `CredentialGrid`, which fixes two columns rather than
 * auto-fitting for the reason this card wanted anyway: four tiles land 2×2 at
 * settings width and would otherwise wrap 3+1, orphaning the last provider.
 *
 * The list is the catalogue in catalogue order, so the local provider comes
 * first (it is the default and needs no vendor account) and a provider added
 * there shows up here without a second edit. Since #135 the map has no branch
 * in it either: which endpoint a provider's credential lives behind is
 * `useCredential`'s business, not the card's, so every provider gets the same
 * tile and the card's only per-provider word is where to get one.
 *
 * The promise every tile would otherwise repeat is made once, under the grid.
 * Four tiles each saying "stored encrypted and never shown again" is the same
 * sentence four times in a space that has room for none of them.
 */
export const CredentialsCard = () => (
  <div className="flex flex-col gap-3">
    <CredentialGrid>
      {PROVIDERS.map((provider) => (
        <CredentialTile
          key={provider}
          provider={provider}
          footnote={CREDENTIAL_COPY[provider].source}
        />
      ))}
    </CredentialGrid>
    <p className="px-1 text-xs text-gousse-muted">
      Each credential is sent once and stored encrypted on the server. It is never shown again —
      only the first characters and the last three.
    </p>
  </div>
);
