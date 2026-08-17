import { useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { TopBar } from "../components/TopBar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BackToInboxButton } from "../components/topbar/BackToInboxButton";
import { MessageActionsIsland } from "../components/topbar/MessageActionsIsland";
import { ReplyButton } from "../components/topbar/ReplyButton";
import { useMessage } from "../api/queries";
import { useTrashMessage } from "../api/mutations";
import { apiErrorMessage } from "../api/apiErrorMessage";
import { useReturnToInbox } from "../features/inbox/useReturnToInbox";
import { MessageDetailHeader } from "../features/message-detail/MessageDetailHeader";
import { MessageDetailBody } from "../features/message-detail/MessageDetailBody";
import { TriagePanel } from "../features/message-detail/TriagePanel";
import { ConfirmationCodePanel } from "../features/message-detail/ConfirmationCodePanel";
import { ReplyComposer } from "../features/reply/ReplyComposer";
import { detectConfirmationCodes } from "../utils/detectConfirmation";
import type { LayoutContext } from "../App";

export const MessageDetailPage = () => {
  // Every way off this page — Back, archive, trash, the confirmation
  // panel's delete — goes through one exit, so the inbox comes back with its
  // account, filters and scroll offset intact (#95).
  const returnToInbox = useReturnToInbox();
  const { accountId, gmailMessageId } = useParams();
  const messageQuery = useMessage(accountId, gmailMessageId);
  const trash = useTrashMessage();
  const { sidebarCollapsed, onToggleSidebar } = useOutletContext<LayoutContext>();
  // Incremented by the top bar's Reply button; the composer owns the open state
  // and treats each new value as one request to expand (see ReplyComposer).
  const [replyOpenSignal, setReplyOpenSignal] = useState(0);

  const message = messageQuery.data;
  const isUnread = message?.labels.some((l) => l.name === "UNREAD") ?? false;
  const latestPriority = message?.triageHistory[0]?.priority ?? null;
  const confirmationDetection = message
    ? detectConfirmationCodes(message.subject, message.bodyText, message.bodyHtml)
    : { found: false, codes: [] };

  // "Handled this confirmation?" trashes the message the code came from. The
  // list drops the row optimistically inside the mutation, so leaving the page
  // is all that's left to do here — and only once the request actually landed,
  // since a failure has to leave the user somewhere they can retry.
  const handleDeleteMessage = () => {
    if (!message || trash.isPending) return;
    trash.mutate(
      {
        accountId: message.accountId,
        gmailMessageId: message.gmailMessageId,
      },
      {
        onSuccess: returnToInbox,
        onError: (err) => toast.error(`Could not delete message: ${apiErrorMessage(err)}`),
      },
    );
  };

  return (
    <>
      <TopBar
        left={
          <>
            {sidebarCollapsed && <SidebarTrigger onClick={onToggleSidebar} />}
            <BackToInboxButton onClick={returnToInbox} />
          </>
        }
        right={
          <>
            {message ? (
              <MessageActionsIsland
                accountId={message.accountId}
                accountEmail={message.accountEmail}
                gmailMessageId={message.gmailMessageId}
                isUnread={isUnread}
                isArchived={message.isArchived}
                isTrashed={message.isTrashed}
                priority={latestPriority}
              />
            ) : null}
            <ReplyButton onClick={() => setReplyOpenSignal((n) => n + 1)} disabled={!message} />
          </>
        }
      />
      <div className="flex-1 px-3 pb-6 pt-4 sm:px-6">
        {messageQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gousse-muted">
            <Spinner /> Loading message…
          </div>
        ) : messageQuery.isError ? (
          <Empty title="Could not load message" description={apiErrorMessage(messageQuery.error)} />
        ) : message ? (
          <div className="flex flex-col gap-4">
            <MessageDetailHeader message={message} />
            <TriagePanel message={message} />
            {confirmationDetection.found && (
              <ConfirmationCodePanel
                detection={confirmationDetection}
                onDelete={handleDeleteMessage}
                isDeleting={trash.isPending}
              />
            )}
            <MessageDetailBody message={message} />
            <ReplyComposer message={message} openSignal={replyOpenSignal} />
          </div>
        ) : null}
      </div>
    </>
  );
};
