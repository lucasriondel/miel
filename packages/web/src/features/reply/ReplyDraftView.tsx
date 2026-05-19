import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";
import { ApiError } from "../../api/client";

interface Props {
  subject: string;
  body: string;
  model: string | null;
  onSubjectChange: (subject: string) => void;
  onBodyChange: (body: string) => void;
  onSend: () => void;
  onDiscard: () => void;
  isSending: boolean;
  sendError: unknown;
  sentMessageId: string | null;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const ReplyDraftView = ({
  subject,
  body,
  model,
  onSubjectChange,
  onBodyChange,
  onSend,
  onDiscard,
  isSending,
  sendError,
  sentMessageId,
}: Props) => {
  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !isSending;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-miel-line bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-miel-muted">
          Draft reply
        </p>
        {model ? (
          <p className="text-xs text-miel-muted">model: {model}</p>
        ) : null}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-miel-muted">Subject</span>
        <input
          type="text"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          className="rounded border border-miel-line bg-white px-2 py-1.5 text-sm text-miel-ink focus:border-miel-ink focus:outline-none"
          disabled={isSending || sentMessageId !== null}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-miel-muted">Body</span>
        <textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          rows={12}
          className="rounded border border-miel-line bg-white px-2 py-1.5 text-sm text-miel-ink focus:border-miel-ink focus:outline-none"
          disabled={isSending || sentMessageId !== null}
        />
      </label>
      {sentMessageId ? (
        <p className="text-xs text-miel-low">
          Sent. Gmail message id: {sentMessageId}
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <Button type="button" variant="primary" disabled={!canSend} onClick={onSend}>
            {isSending ? <Spinner /> : null}
            Send
          </Button>
          <Button type="button" variant="ghost" disabled={isSending} onClick={onDiscard}>
            Discard
          </Button>
        </div>
      )}
      {sendError ? (
        <p className="text-xs text-miel-high">
          Send failed: {describeError(sendError)}
        </p>
      ) : null}
    </div>
  );
};
