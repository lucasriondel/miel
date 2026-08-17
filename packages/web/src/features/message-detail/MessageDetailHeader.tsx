import type { MessageDetail } from "../../api/types";
import { MessageAttachments } from "../../components/MessageAttachments";
import { MessageLabels } from "../../components/MessageLabels";
import { MessageMetaDisclosure } from "./MessageMetaDisclosure";
import { SenderLine } from "./SenderLine";

interface Props {
  message: MessageDetail;
}

/** What `MessageLabels` hides at the top of every list — never worth a badge row. */
const isNoiseLabel = (name: string) => name === "INBOX" || name === "UNREAD";

export const MessageDetailHeader = ({ message }: Props) => {
  const latest = message.triageHistory[0];
  const existingSuggestions =
    latest?.existingLabelSuggestions
      .filter((s) => s.status === "pending")
      .filter((s) => !message.labels.some((l) => l.id === s.labelId))
      .map((s) => ({
        labelId: s.labelId,
        name: s.name,
        colorBg: s.colorBg,
        colorFg: s.colorFg,
      })) ?? [];
  const newSuggestions =
    latest?.newLabelSuggestions
      .filter((s) => s.status === "pending")
      .map((s) => ({ suggestionId: s.suggestionId, name: s.name })) ?? [];

  // Both children self-hide when empty, so the wrapping row has to ask the same
  // question they do — otherwise an empty flex row still spends the header's gap.
  const hasBadges =
    message.labels.some((l) => !isNoiseLabel(l.name)) ||
    existingSuggestions.length > 0 ||
    newSuggestions.length > 0 ||
    message.attachments.length > 0;

  return (
    <header className="flex flex-col gap-3 border-b border-gousse-line/50 pb-6">
      <h1 className="text-2xl font-bold text-gousse-ink text-balance leading-tight">
        {message.subject?.trim() || "(no subject)"}
      </h1>
      <SenderLine message={message} />
      {hasBadges && (
        <div className="flex flex-wrap items-center gap-2">
          <MessageLabels
            accountId={message.accountId}
            gmailMessageId={message.gmailMessageId}
            triageId={latest?.id ?? null}
            labels={message.labels}
            existingSuggestions={existingSuggestions}
            newSuggestions={newSuggestions}
            variant="full"
          />
          <MessageAttachments
            accountId={message.accountId}
            gmailMessageId={message.gmailMessageId}
            attachments={message.attachments}
            variant="full"
          />
        </div>
      )}
      {/* Last in the header so opening it pushes nothing but the hairline down. */}
      <MessageMetaDisclosure message={message} />
    </header>
  );
};
