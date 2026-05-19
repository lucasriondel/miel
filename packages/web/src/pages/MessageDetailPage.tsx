import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { Spinner } from "../components/Spinner";
import { useMessage } from "../api/queries";
import { MessageDetailHeader } from "../features/message-detail/MessageDetailHeader";
import { MessageDetailBody } from "../features/message-detail/MessageDetailBody";
import { MessageActions } from "../features/message-detail/MessageActions";
import { SuggestedLabelsPanel } from "../features/message-detail/SuggestedLabelsPanel";
import { TriageHistoryPanel } from "../features/message-detail/TriageHistoryPanel";

export const MessageDetailPage = () => {
  const { accountId, gmailMessageId } = useParams();
  const messageQuery = useMessage(accountId, gmailMessageId);

  return (
    <div className="flex flex-col gap-4">
      <Link to="/" className="text-sm text-miel-muted hover:underline">
        ← Back to inbox
      </Link>
      {messageQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-miel-muted">
          <Spinner /> Loading message…
        </div>
      ) : messageQuery.isError ? (
        <EmptyState
          title="Could not load message"
          description={messageQuery.error instanceof Error ? messageQuery.error.message : "Unknown error"}
        />
      ) : messageQuery.data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-4">
            <MessageDetailHeader message={messageQuery.data} />
            <MessageActions message={messageQuery.data} />
            <MessageDetailBody message={messageQuery.data} />
          </div>
          <aside className="flex flex-col gap-4">
            <SuggestedLabelsPanel message={messageQuery.data} />
            <TriageHistoryPanel message={messageQuery.data} />
          </aside>
        </div>
      ) : null}
    </div>
  );
};
