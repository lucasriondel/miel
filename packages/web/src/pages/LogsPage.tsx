import { useLogs } from "../api/queries";
import { apiErrorMessage } from "../api/apiErrorMessage";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "../features/shell/PageHeader";
import { PageLayout } from "../features/shell/PageLayout";
import { LogsTable } from "../features/logs/LogsTable";

/**
 * The history of sync and triage runs. The redesign draws no Logs page, so it
 * wears the shape the drawn pages share: the display title, then one centred
 * hairline card.
 */
export const LogsPage = () => {
  const { data, isLoading, error } = useLogs();

  return (
    <PageLayout header={<PageHeader title="Logs" />} bodyClassName="px-5 pt-2 pb-12 sm:px-8">
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
        <p className="text-[13px] text-gousse-muted">
          History of sync and triage runs across all accounts, newest first.
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-gousse-muted">
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
    </PageLayout>
  );
};
