import type { MessageDetail } from "../../api/types";
import { DraftReplyCardBody } from "./DraftReplyCardBody";

/**
 * The reader's foot: the reply pills at rest, and the AI's draft once asked
 * for. Keyed by the message so moving to the next one in the reader starts it
 * from rest rather than showing the previous message's draft.
 */
export const DraftReplyCard = ({ message }: { message: MessageDetail }) => (
  <DraftReplyCardBody key={`${message.accountId}/${message.gmailMessageId}`} message={message} />
);
