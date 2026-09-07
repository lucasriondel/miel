import type { MessageDetail } from "../../api/types";
import { AttachmentRow } from "./AttachmentRow";
import { DetailCard } from "./DetailCard";

interface Props {
  message: MessageDetail;
}

/**
 * The files that arrived with the message, under it rather than in its header
 * (#143). A message with none renders nothing — no heading, no empty card.
 */
export const MessageAttachmentsSection = ({ message }: Props) => {
  const { attachments } = message;
  if (attachments.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gousse-muted">
        Attachments{attachments.length > 1 ? ` · ${attachments.length}` : ""}
      </h2>
      <DetailCard>
        <ul>
          {attachments.map((attachment, index) => (
            <li
              key={attachment.attachmentId}
              className={index === 0 ? undefined : "border-t border-gousse-line/60"}
            >
              <AttachmentRow
                accountId={message.accountId}
                gmailMessageId={message.gmailMessageId}
                attachment={attachment}
              />
            </li>
          ))}
        </ul>
      </DetailCard>
    </section>
  );
};
