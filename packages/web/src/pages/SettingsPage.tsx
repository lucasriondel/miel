import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../features/shell/PageHeader";
import { PageLayout } from "../features/shell/PageLayout";
import { AiTab } from "../features/settings/AiTab";
import { GeneralTab } from "../features/settings/GeneralTab";
import { MailboxesTab } from "../features/settings/MailboxesTab";
import { SettingsTabs } from "../features/settings/SettingsTabs";
import { SyncTab } from "../features/settings/SyncTab";
import {
  SETTINGS_TAB_PARAM,
  parseSettingsTab,
  type SettingsTabId,
} from "../features/settings/settingsTabIds";

const PANELS: Record<SettingsTabId, () => React.JSX.Element> = {
  general: GeneralTab,
  mailboxes: MailboxesTab,
  ai: AiTab,
  sync: SyncTab,
};

/**
 * Settings, as four tabs under the page title (`miel.figcraft`, Settings):
 * General, Mailboxes, AI, Sync — one centred 880px column of cards each.
 *
 * The open tab is the URL's `?tab=` (see `settingsTabs.ts`), replaced rather
 * than pushed so switching tabs does not fill the back button. The Google OAuth
 * callback's ?connected= / ?connect_error= confirmation is handled once on the
 * app layout (`useConnectResult`), since a connect can also land on the inbox.
 */
export const SettingsPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = parseSettingsTab(params.get(SETTINGS_TAB_PARAM));
  const Panel = PANELS[tab];

  const select = (next: SettingsTabId) =>
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set(SETTINGS_TAB_PARAM, next);
        return out;
      },
      { replace: true },
    );

  return (
    <PageLayout
      header={
        <PageHeader
          title="Settings"
          bordered
          below={<SettingsTabs value={tab} onChange={select} />}
        />
      }
      bodyClassName="px-5 pt-7 pb-12 sm:px-8"
    >
      <div
        role="tabpanel"
        id={`settings-panel-${tab}`}
        aria-labelledby={`settings-tab-${tab}`}
        className="mx-auto flex w-full max-w-[880px] flex-col gap-6"
      >
        <Panel />
      </div>
    </PageLayout>
  );
};
