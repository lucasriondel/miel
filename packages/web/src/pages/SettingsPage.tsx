import { type ReactNode } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useSettings, useTriageBatchSettings } from "../api/queries";
import { apiErrorMessage } from "../api/apiErrorMessage";
import { SettingsGroup } from "../features/settings/SettingsGroup";
import { ThemeRow } from "../features/settings/ThemeRow";
import { SettingsCard } from "@/components/ui/setting-row";
import { ModelsCard } from "../features/settings/ModelsCard";
import { TriageBatchSettings } from "../features/settings/TriageBatchSettings";
import { CredentialsCard } from "../features/settings/CredentialsCard";
import { AutomaticSyncManager } from "../features/settings/AutomaticSyncManager";
import { AccountsManager } from "../features/settings/AccountsManager";
import { WorpCard } from "../features/settings/WorpCard";
import { TopBar } from "../components/TopBar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BackToInboxButton } from "../components/topbar/BackToInboxButton";
import type { LayoutContext } from "../App";

/**
 * A labelled subsection inside a group: a small caption tight above its card.
 * Kept as one unit so the group's larger gap separates subsections, not the
 * caption from its own content.
 */
const Subsection = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2">
    <h3 className="px-1 text-xs font-semibold text-gousse-muted">{label}</h3>
    {children}
  </div>
);

const LoadingCard = () => (
  <SettingsCard>
    <div className="flex items-center gap-2 px-4 py-3.5 text-sm text-gousse-muted">
      <Spinner /> Loading settings…
    </div>
  </SettingsCard>
);

export const SettingsPage = () => {
  const { data, isLoading, error } = useSettings();
  const { data: batchData, isLoading: batchLoading, error: batchError } = useTriageBatchSettings();
  const navigate = useNavigate();
  const { sidebarCollapsed, onToggleSidebar } = useOutletContext<LayoutContext>();
  // The Google OAuth callback's ?connected= / ?connect_error= confirmation is
  // handled once on the app layout (`useConnectResult`), since a connect can
  // also land on the inbox.

  return (
    <>
      <TopBar
        left={
          <>
            {sidebarCollapsed && <SidebarTrigger onClick={onToggleSidebar} />}
            <BackToInboxButton onClick={() => navigate("/")} />
          </>
        }
        right={null}
      />
      <div className="settings-surface mx-auto w-full max-w-[720px] px-6 pb-24 pt-4">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-balance">Settings</h1>
          <p className="text-sm text-gousse-muted">Connections first, then what runs on them.</p>
        </div>

        {/* Connections comes before AI & Triage because it holds the
            preconditions for it: the provider select only offers vendors with a
            stored key, so being asked for a model before a credential was
            asking for the consequence first.

            Mailboxes live there too, and the group that used to be "Data" is
            gone. Data named the storage; what the group held was one card of
            Gmail accounts, which is the same kind of thing as an AI provider —
            a connection the app makes on the user's behalf, with a credential
            behind it.

            worp stays a group of its own rather than a third connection: it is
            an outbound integration miel pushes to, not a source it reads from
            (#107). */}
        <div className="flex flex-col gap-10">
          <SettingsGroup id="general" label="General">
            <SettingsCard>
              <ThemeRow />
            </SettingsCard>
          </SettingsGroup>

          <SettingsGroup id="connections" label="Connections">
            {/* One subsection, not an "AI token" pill beside an "API keys"
                card (#110): every provider's credential is the same kind of
                setting, and the split made the local one look otherwise. */}
            <Subsection label="AI providers">
              <CredentialsCard />
            </Subsection>

            <Subsection label="Mailboxes">
              <AccountsManager />
            </Subsection>
          </SettingsGroup>

          <SettingsGroup id="ai" label="AI & Triage">
            <Subsection label="Models">
              {isLoading ? (
                <LoadingCard />
              ) : error ? (
                <Empty title="Failed to load settings" description={apiErrorMessage(error)} />
              ) : data ? (
                <ModelsCard value={data} />
              ) : null}
            </Subsection>

            <Subsection label="Triage batching">
              {batchLoading ? (
                <LoadingCard />
              ) : batchError ? (
                <Empty title="Failed to load settings" description={apiErrorMessage(batchError)} />
              ) : batchData ? (
                <TriageBatchSettings value={batchData} />
              ) : null}
            </Subsection>

            <Subsection label="Automatic sync">
              <AutomaticSyncManager />
            </Subsection>
          </SettingsGroup>

          <SettingsGroup id="integrations" label="Integrations">
            <Subsection label="worp">
              <WorpCard />
            </Subsection>
          </SettingsGroup>
        </div>
      </div>
    </>
  );
};
