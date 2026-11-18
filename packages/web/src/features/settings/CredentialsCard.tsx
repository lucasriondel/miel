import { PROVIDERS } from "@miel/core/providerModels";
import { CredentialTile } from "./CredentialTile";
import { SettingsPanel } from "./SettingsPanel";

/**
 * Every AI credential, one row per provider — the Providers card.
 *
 * They used to be two subsections — a read-only pill for the local provider's
 * token and a card of vendor keys — which made one credential look like a
 * different category of setting from the other three (#110). One list of peers
 * is what the storage says, so it is what this says: `encrypted_secrets` holds
 * one row per credential, none of them privileged over the others.
 *
 * The list is the catalogue in catalogue order, so the local provider comes
 * first (it is the default and needs no vendor account) and a provider added
 * there shows up here without a second edit. Since #135 the map has no branch
 * in it either: which endpoint a provider's credential lives behind is
 * `useCredential`'s business, not the card's, so every provider gets the same
 * row.
 *
 * The promise every row would otherwise repeat is made once, under the card.
 */
export const CredentialsCard = () => (
  <div className="flex flex-col gap-2">
    <SettingsPanel title="Providers">
      {PROVIDERS.map((provider) => (
        <CredentialTile key={provider} provider={provider} />
      ))}
    </SettingsPanel>
    <p className="px-1 text-xs text-gousse-muted">
      Each credential is sent once and stored encrypted on the server. It is never shown again —
      only the first characters and the last three.
    </p>
  </div>
);
