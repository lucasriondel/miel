import { useNavigate } from "react-router-dom";
import { useLogs } from "../api/queries";
import { apiErrorMessage } from "../api/apiErrorMessage";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { TopBarStart, TopBarTitle } from "@/components/ui/app-shell";
import { PageTopBar } from "../features/shell/PageTopBar";
import { BackToInboxButton } from "../components/topbar/BackToInboxButton";
import { LogsTable } from "../features/logs/LogsTable";

export const LogsPage = () => {
  const { data, isLoading, error } = useLogs();
  const navigate = useNavigate();

  return (
    <>
      <PageTopBar>
        <TopBarStart>
          <BackToInboxButton onClick={() => navigate("/")} />
        </TopBarStart>
        <TopBarTitle centered>Logs</TopBarTitle>
      </PageTopBar>
      <div className="flex flex-col gap-6">
        <p className="text-sm text-gousse-muted">
          History of sync and triage runs across all accounts, newest first.
        </p>

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
