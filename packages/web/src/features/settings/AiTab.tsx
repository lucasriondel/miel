import { useSettings, useTriageBatchSettings } from "../../api/queries";
import { AiCredentialNotice } from "./AiCredentialNotice";
import { CredentialsCard } from "./CredentialsCard";
import { ModelsCard } from "./ModelsCard";
import { SettingsLoadError } from "./SettingsLoadError";
import { SettingsSkeleton } from "./SettingsSkeleton";
import { TriageBatchSettings } from "./TriageBatchSettings";

/**
 * AI: which provider runs each task, the credentials those providers need, and
 * how triage batches its calls — in that order on the page, the design's.
 *
 * Tasks come first and credentials second, the reverse of the old single
 * scroll, because the tab is now one screen: the callout above both says when a
 * task cannot run, and the fix is directly under it either way.
 */
export const AiTab = () => {
  const settings = useSettings();
  const batch = useTriageBatchSettings();

  if (settings.isLoading) return <SettingsSkeleton />;

  return (
    <>
      {settings.data ? <AiCredentialNotice settings={settings.data} /> : null}
      {settings.error ? (
        <SettingsLoadError what="settings" error={settings.error} />
      ) : settings.data ? (
        <ModelsCard value={settings.data} />
      ) : null}
      <CredentialsCard />
      {batch.isLoading ? (
        <SettingsSkeleton cards={1} />
      ) : batch.error ? (
        <SettingsLoadError what="triage batching" error={batch.error} />
      ) : batch.data ? (
        <TriageBatchSettings value={batch.data} />
      ) : null}
    </>
  );
};
