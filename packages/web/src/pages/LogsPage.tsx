import { useNavigate, useOutletContext } from "react-router-dom";
import { useLogs } from "../api/queries";
import { apiErrorMessage } from "../api/apiErrorMessage";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { TopBar } from "../components/TopBar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BackToInboxButton } from "../components/topbar/BackToInboxButton";
import { LogsTable } from "../features/logs/LogsTable";
import type { LayoutContext } from "../App";

export const LogsPage = () => {
  const { data, isLoading, error } = useLogs();
  const navigate = useNavigate();
  const { sidebarCollapsed, onToggleSidebar } = useOutletContext<LayoutContext>();

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
      <div className="flex flex-col gap-6 px-3 pb-6 pt-4 sm:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-balance">Logs</h1>
          <p className="text-sm text-gousse-muted">
            History of sync and triage runs across all accounts, newest first.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gousse-muted">
            <Spinner /> Loading logs…
          </div>
        ) : error ? (
          <Empty title="Failed to load logs" description={apiErrorMessage(error)} />
        ) : !data || data.entries.length === 0 ? (
          <Empty
            title="No runs yet"
            description="Sync or triage runs will appear here once they happen."
          />
        ) : (
          <LogsTable entries={data.entries} />
        )}
      </div>
    </>
  );
};
