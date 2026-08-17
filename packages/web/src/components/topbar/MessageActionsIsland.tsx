import type { Priority } from "../../api/types";
import { Island } from "../Island";
import { MessageActions } from "../MessageActions";

interface Props {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  isUnread: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  priority: Priority | null;
}

/**
 * Right island on the message-detail bar: the per-message actions, in the pill
 * the inbox gives its own right-hand cluster. Only the container is new — the
 * icons stay `MessageActions`' `detail` variant, so the row and the detail view
 * keep sharing one definition of what the actions are.
 */
export const MessageActionsIsland = (props: Props) => (
  <Island>
    <MessageActions {...props} variant="detail" />
  </Island>
);
