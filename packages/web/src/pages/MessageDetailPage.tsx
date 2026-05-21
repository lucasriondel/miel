import { Link, useOutletContext, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { Spinner } from "../components/Spinner";
import { TopBar } from "../components/TopBar";
import { useMessage } from "../api/queries";
import { MessageDetailHeader } from "../features/message-detail/MessageDetailHeader";
import { MessageDetailBody } from "../features/message-detail/MessageDetailBody";
import { MessageDetailActions } from "../features/message-detail/MessageDetailActions";
import { TriagePanel } from "../features/message-detail/TriagePanel";
import { SyncRangeControls } from "../features/sync/SyncRangeControls";
import { SyncStatusBanner } from "../features/sync/SyncStatusBanner";
import { ReplyComposer } from "../features/reply/ReplyComposer";
import type { LayoutContext } from "../App";

export const MessageDetailPage = () => {
  const { accountId, gmailMessageId } = useParams();
  const messageQuery = useMessage(accountId, gmailMessageId);
  const {
    selectedAccountEmail,
    syncStatus,
    onSyncResult,
    onSyncError,
    dismissSyncStatus,
  } = useOutletContext<LayoutContext>();

  const message = messageQuery.data;
  const isUnread = message?.labels.some((l) => l.name === "UNREAD") ?? false;

  return (
    <>
      <TopBar
        left={
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-miel-muted hover:text-miel-ink"
          >
            ← Back to inbox
          </Link>
        }
        right={
          <>
            {message ? (
              <>
                <MessageDetailActions
                  accountId={message.accountId}
                  gmailMessageId={message.gmailMessageId}
                  isUnread={isUnread}
                  isArchived={message.isArchived}
                  isTrashed={message.isTrashed}
                />
                <div className="h-6 w-px bg-miel-line" aria-hidden />
              </>
            ) : null}
            <SyncRangeControls
              accountEmail={selectedAccountEmail}
              onResult={onSyncResult}
              onError={onSyncError}
            />
          </>
        }
      />
      <div className="flex-1 px-6 pb-6 pt-4">
        <SyncStatusBanner status={syncStatus} onDismiss={dismissSyncStatus} />
        {messageQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-miel-muted">
            <Spinner /> Loading message…
          </div>
        ) : messageQuery.isError ? (
          <EmptyState
            title="Could not load message"
            description={
              messageQuery.error instanceof Error
                ? messageQuery.error.message
                : "Unknown error"
            }
          />
        ) : message ? (
          <div className="flex flex-col gap-4">
            <MessageDetailHeader message={message} />
            <TriagePanel message={message} />
            <MessageDetailBody message={message} />
            <ReplyComposer message={message} />
          </div>
        ) : null}
      </div>
    </>
  );
};
