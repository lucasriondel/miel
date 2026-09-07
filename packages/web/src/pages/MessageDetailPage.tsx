import { useState } from "react";
import { useParams } from "react-router-dom";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { TopBarStart, TopBarEnd } from "@/components/ui/app-shell";
import { PageTopBar } from "../features/shell/PageTopBar";
import { BackToInboxButton } from "../components/topbar/BackToInboxButton";
import { MessageActions } from "../components/MessageActions";
import { ReplyButton } from "../components/topbar/ReplyButton";
import { useMessage } from "../api/queries";
import { useTrashMessage } from "../api/mutations";
import { apiErrorMessage } from "../api/apiErrorMessage";
import { useReturnToInbox } from "../features/inbox/useReturnToInbox";
import { MessageDetailHeader } from "../features/message-detail/MessageDetailHeader";
import { MessageDetailBody } from "../features/message-detail/MessageDetailBody";
import { MessageAttachmentsSection } from "../features/message-detail/MessageAttachmentsSection";
import { TriagePanel } from "../features/message-detail/TriagePanel";
import { ConfirmationCodePanel } from "../features/message-detail/ConfirmationCodePanel";
import { PromoCodePanel } from "../features/message-detail/PromoCodePanel";
import { useMarkReadOnOpen } from "../features/message-detail/useMarkReadOnOpen";
import { ReplyComposer } from "../features/reply/ReplyComposer";
import { detectConfirmationCodes } from "../utils/detectConfirmation";

export const MessageDetailPage = () => {
  // Every way off this page — Back, archive, trash, the confirmation
  // panel's delete — goes through one exit, so the inbox comes back with its
  // account, filters and scroll offset intact (#95).
  const returnToInbox = useReturnToInbox();
  const { accountId, gmailMessageId } = useParams();
  const messageQuery = useMessage(accountId, gmailMessageId);
  const trash = useTrashMessage();
  // Incremented by the top bar's Reply button; the composer owns the open state
  // and treats each new value as one request to expand (see ReplyComposer).
  const [replyOpenSignal, setReplyOpenSignal] = useState(0);

  const message = messageQuery.data;
  // Reading a message is what marks it read (#142) — no click, and once per
  // message however often the query behind this page resolves again.
  useMarkReadOnOpen(message);
  const isUnread = message?.labels.some((l) => l.name === "UNREAD") ?? false;
  const latestPriority = message?.triageHistory[0]?.priority ?? null;
  const confirmationDetection = message
    ? detectConfirmationCodes(message.subject, message.bodyText, message.bodyHtml)
    : { found: false, codes: [] };

  // "Handled this confirmation?" trashes the message the code came from. The
  // list drops the row optimistically inside the mutation, so leaving the page
  // is all that's left to do here — and it happens on the click, not on the
  // answer (#145): there is nothing on this page left to look at. A delete the
  // server refuses puts the row back and says so from the mutation, which is
  // where the notice has to live once the page that fired it is gone.
  const handleDeleteMessage = () => {
    if (!message || trash.isPending) return;
    trash.mutate({
      accountId: message.accountId,
      gmailMessageId: message.gmailMessageId,
    });
    returnToInbox();
  };

  return (
    <>
      <PageTopBar>
        <TopBarStart>
          <BackToInboxButton onClick={returnToInbox} />
        </TopBarStart>
        <TopBarEnd>
          {message ? (
            <MessageActions
              accountId={message.accountId}
              accountEmail={message.accountEmail}
              gmailMessageId={message.gmailMessageId}
              isUnread={isUnread}
              isArchived={message.isArchived}
              isTrashed={message.isTrashed}
              priority={latestPriority}
              variant="detail"
            />
          ) : null}
          <ReplyButton onClick={() => setReplyOpenSignal((n) => n + 1)} disabled={!message} />
        </TopBarEnd>
      </PageTopBar>
      <div className="flex-1">
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
            {/* Below the triage, above the body: asking what this mail is
                offering is a reading of it, so the question sits with the other
                things read out of it rather than in the top bar (#165). */}
            <PromoCodePanel message={message} />
            <MessageDetailBody message={message} />
            {/* Below the body: what arrived with the message, not metadata
                about it — and nothing at all when none did (#143). */}
            <MessageAttachmentsSection message={message} />
            <ReplyComposer message={message} openSignal={replyOpenSignal} />
          </div>
        ) : null}
      </div>
    </>
  );
};
