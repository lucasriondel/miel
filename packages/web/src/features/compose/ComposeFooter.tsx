import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { apiErrorMessage } from "../../api/apiErrorMessage";

interface Props {
  canSend: boolean;
  isSending: boolean;
  sendError: unknown;
  /** The Gmail id of the sent message, once a send has landed. */
  sentMessageId: string | null;
  onSend: () => void;
  onDiscard: () => void;
  /** The word for throwing the draft away — "Discard" on a reply. */
  discardLabel?: string;
}

/**
 * The window's actions: send it, or throw it away.
 *
 * Once sent, the controls are replaced by the confirmation rather than joined
 * by it — the Gmail id is the only place the user can read what was sent, and a
 * live Send button beside it invites a second copy of the same reply.
 */
export const ComposeFooter = ({
  canSend,
  isSending,
  sendError,
  sentMessageId,
  onSend,
  onDiscard,
  discardLabel = "Discard",
}: Props) => (
  <div className="flex flex-col gap-2 border-t border-gousse-line/60 pt-3">
    {sentMessageId ? (
      <p className="text-xs text-gousse-low">Sent. Gmail message id: {sentMessageId}</p>
    ) : (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="primary"
          className="min-h-10"
          disabled={!canSend}
          onClick={onSend}
        >
          {isSending ? <Spinner /> : null}
          Send
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-10"
          disabled={isSending}
          onClick={onDiscard}
        >
          {discardLabel}
        </Button>
      </div>
    )}
    {sendError ? (
      <p className="text-xs text-gousse-high">Send failed: {apiErrorMessage(sendError)}</p>
    ) : null}
  </div>
);
