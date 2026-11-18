import { useEffect } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { ChevronLeft, X } from "lucide-react";
import { Empty } from "@/components/ui/empty";
import { MessageActions } from "../components/MessageActions";
import { iconButtonClass, iconButtonIconClass } from "../components/iconButton";
import { useMessage } from "../api/queries";
import { useTrashMessage } from "../api/mutations";
import { apiErrorMessage } from "../api/apiErrorMessage";
import { useReturnToInbox } from "../features/inbox/useReturnToInbox";
import type { ReaderContext } from "../features/inbox/readerContext";
import { isTypingTarget } from "../features/shell/isTypingTarget";
import { MessageDetailHeader } from "../features/message-detail/MessageDetailHeader";
import { MessageDetailBody } from "../features/message-detail/MessageDetailBody";
import { MessageAttachmentsSection } from "../features/message-detail/MessageAttachmentsSection";
import { TriagePanel } from "../features/message-detail/TriagePanel";
import { ConfirmationCodePanel } from "../features/message-detail/ConfirmationCodePanel";
import { PromoCodePanel } from "../features/message-detail/PromoCodePanel";
import { ReaderPager } from "../features/message-detail/ReaderPager";
import { ReaderSkeleton } from "../features/message-detail/ReaderSkeleton";
import { useReaderPager } from "../features/message-detail/useReaderPager";
import { useMarkReadOnOpen } from "../features/message-detail/useMarkReadOnOpen";
import { ReplySplitButton } from "../features/reply/ReplySplitButton";
import { DraftReplyCard } from "../features/reply/DraftReplyCard";
import { detectConfirmationCodes } from "../utils/detectConfirmation";

/**
 * The reader: the open message, in the column beside the list (Main view ›
 * List + reader). It is the inbox's child route, so the list stays mounted and
 * scrolled beside it; below `lg` it takes the whole column instead.
 *
 * Its toolbar is the message's actions, the Reply split button and the pager
 * ("1 of 3") through the list's reading order. Every way off it — the back
 * arrow, Escape, archive, trash, the confirmation panel's delete — goes
 * through one exit, so the list comes back with its account, filters and
 * scroll offset intact (#95).
 */
export const MessageDetailPage = () => {
  const returnToInbox = useReturnToInbox();
  const { accountId, gmailMessageId } = useParams();
  // Outside the inbox (a test mounting the reader alone) there is no list to
  // walk, and the pager simply has nowhere to go.
  const reader = useOutletContext<ReaderContext | undefined>();
  const pager = useReaderPager(reader?.readingOrder ?? [], gmailMessageId);
  const messageQuery = useMessage(accountId, gmailMessageId);
  const trash = useTrashMessage();

  const message = messageQuery.data;
  // Reading a message is what marks it read (#142) — no click, and once per
  // message however often the query behind this page resolves again.
  useMarkReadOnOpen(message);
  const isUnread = message?.labels.some((l) => l.name === "UNREAD") ?? false;
  const latestPriority = message?.triageHistory[0]?.priority ?? null;
  const confirmationDetection = message
    ? detectConfirmationCodes(message.subject, message.bodyText, message.bodyHtml)
    : { found: false, codes: [] };

  // Escape closes the reader, unless someone is typing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || isTypingTarget(e.target) || e.defaultPrevented) return;
      returnToInbox();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [returnToInbox]);

  // "Handled this confirmation?" trashes the message the code came from. The
  // list drops the row optimistically inside the mutation, so leaving the
  // reader is all that's left to do here — and it happens on the click, not on
  // the answer (#145).
  const handleDeleteMessage = () => {
    if (!message || trash.isPending) return;
    trash.mutate({
      accountId: message.accountId,
      gmailMessageId: message.gmailMessageId,
    });
    returnToInbox();
  };

  return (
    <section
      aria-label="Message"
      className="flex min-h-0 w-full min-w-0 flex-col border-l border-gousse-line bg-gousse-panel lg:w-[46%] lg:max-w-[644px] lg:min-w-[440px] lg:shrink-0"
    >
      <div className="flex h-[60px] shrink-0 items-center gap-1 border-b border-gousse-line px-3 sm:h-[78px] sm:px-6 xl:px-10">
        <button
          type="button"
          onClick={returnToInbox}
          aria-label="Back to inbox"
          title="Back to inbox (Esc)"
          className={iconButtonClass()}
        >
          <ChevronLeft className={`${iconButtonIconClass()} lg:hidden`} aria-hidden />
          <X className={`${iconButtonIconClass()} hidden lg:block`} aria-hidden />
        </button>
        <span aria-hidden className="mx-1 h-[18px] w-px bg-gousse-line" />
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
        {message ? <ReplySplitButton message={message} /> : null}
        <ReaderPager {...pager} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col gap-5 px-5 pt-6 pb-7 sm:px-6 sm:pt-[34px] xl:px-10">
          {messageQuery.isLoading ? (
            <ReaderSkeleton />
          ) : messageQuery.isError ? (
            <Empty
              title="Could not load message"
              description={apiErrorMessage(messageQuery.error)}
            />
          ) : message ? (
            <>
              <MessageDetailHeader message={message} banner={<TriagePanel message={message} />} />
              {confirmationDetection.found && (
                <ConfirmationCodePanel
                  detection={confirmationDetection}
                  onDelete={handleDeleteMessage}
                  isDeleting={trash.isPending}
                />
              )}
              <MessageDetailBody message={message} />
              {/* Below the body: what arrived with the message, not metadata
                  about it — and nothing at all when none did (#143). */}
              <MessageAttachmentsSection message={message} />
              {/* Asking what this mail is offering is a reading of it, so the
                  question sits with the other things read out of it (#165). */}
              <PromoCodePanel message={message} />
              <div className="mt-auto pt-2">
                <DraftReplyCard message={message} />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
};
