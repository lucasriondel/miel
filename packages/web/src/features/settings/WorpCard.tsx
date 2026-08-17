import { Spinner } from "@/components/ui/spinner";
import { useWorpSettings } from "../../api/worpSettings.hooks";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { SettingsCard } from "@/components/ui/setting-row";
import { WorpApiKeyRow } from "./WorpApiKeyRow";
import { WorpBaseUrlRow } from "./WorpBaseUrlRow";
import { WorpHeadersRow } from "./WorpHeadersRow";
import { WorpStatusRow } from "./WorpStatusRow";

/**
 * The worp relay's configuration, all of it (#107).
 *
 * It used to be four environment variables, which made pointing miel at a
 * different worp a redeploy — in a product where every other user-facing
 * choice is a runtime setting. The base URL now lives in `app_settings` and the
 * key and proxy headers are encrypted in Postgres beside it.
 *
 * Status is stated first because the two halves gate each other: with only one
 * set, nothing in the rest of the card says the relay is still off.
 */
export const WorpCard = () => {
  const { data, isLoading, error } = useWorpSettings();

  if (isLoading) {
    return (
      <SettingsCard>
        <div className="flex items-center gap-2 px-4 py-3.5 text-sm text-gousse-muted">
          <Spinner /> Loading worp settings…
        </div>
      </SettingsCard>
    );
  }

  if (error || !data) {
    return (
      <SettingsCard>
        <div className="px-4 py-3.5 text-sm text-gousse-high">
          {error ? apiErrorMessage(error) : "Failed to load worp settings"}
        </div>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard>
      <WorpStatusRow
        configured={data.configured}
        hasBaseUrl={data.baseUrl.length > 0}
        hasApiKey={data.apiKey.configured}
      />
      {/* Keyed on the stored value so a save elsewhere in the card refreshes
          the field's baseline rather than leaving a stale draft in place. */}
      <WorpBaseUrlRow key={data.baseUrl} baseUrl={data.baseUrl} />
      <WorpApiKeyRow apiKey={data.apiKey} />
      <WorpHeadersRow extraHeaders={data.extraHeaders} />
    </SettingsCard>
  );
};
