import { useState } from "react";
import {
  CLAUDE_CODE_PROVIDER,
  CREDENTIAL_PROVIDERS,
  PROVIDER_LABELS,
} from "@miel/core/providerModels";
import { SettingsCard } from "@/components/ui/setting-row";
import { ModelRow } from "./ModelRow";
import { useProviderCredentials } from "../../api/providerCredential.hooks";
import type { ModelSettings } from "../../api/types";

interface Props {
  value: ModelSettings;
}

/**
 * Every provider name in this note is read off the catalogue rather than
 * written out. Two reasons, and they point the same way: a provider added there
 * is named here without a second edit, and #93 keeps vendor names out of the
 * source's copy — the catalogue is where they are allowed to live.
 */
const localName = PROVIDER_LABELS[CLAUDE_CODE_PROVIDER];
/** "Anthropic, Google or OpenAI". */
const vendorNames = CREDENTIAL_PROVIDERS.map((p) => PROVIDER_LABELS[p])
  .join(", ")
  .replace(/, ([^,]*)$/, " or $1");

/**
 * The three provider/model pickers as dense rows in a single card.
 *
 * The pickers only offer providers with a stored credential, so when nothing
 * but the local one is set up every select has a single option. That is not
 * self-explanatory — it looks like the vendors are missing — so the card says
 * where they come from, once, under the rows rather than in each of them.
 */
export const ModelsCard = ({ value }: Props) => {
  // Every save answers with the whole settings object, so the card restates it
  // rather than patching one field: switching provider also moves the model.
  const [settings, setSettings] = useState(value);
  const credentials = useProviderCredentials();
  const noVendorKeys = !credentials.pending && credentials.configured.size === 0;

  return (
    <div className="flex flex-col gap-2">
      <SettingsCard>
        <ModelRow
          task="triage"
          title="Triage"
          description="Classifies priority and suggests labels in each sync batch."
          value={settings.triageModel}
          provider={settings.triageProvider}
          onSaved={setSettings}
        />
        <ModelRow
          task="filter"
          title="Filter"
          description="Proposes Gmail filters from each synced batch."
          value={settings.filterModel}
          provider={settings.filterProvider}
          onSaved={setSettings}
        />
        <ModelRow
          task="reply"
          title="Reply"
          description="Generates a draft when you click Generate in the composer."
          value={settings.replyModel}
          provider={settings.replyProvider}
          onSaved={setSettings}
        />
      </SettingsCard>
      {noVendorKeys ? (
        <p className="px-1 text-xs text-gousse-muted">
          Only {localName} is set up, so it is the only provider offered. Add a vendor key under
          Connections to run a task on {vendorNames}.
        </p>
      ) : null}
    </div>
  );
};
