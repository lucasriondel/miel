import { Archive, Loader2, Pencil, Send, Sparkles } from "lucide-react";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { AppButton } from "../../components/AppButton";
import { DraftReplyShell } from "./DraftReplyShell";

interface Props {
  body: string;
  sending: boolean;
  /** A send that was refused, said in the card. */
  error: unknown;
  onRegenerate: () => void;
  onSend: () => void;
  onSendAndArchive: () => void;
  onEdit: () => void;
}

/** The AI's draft, ready: the text, then Send, Edit and Send & archive. */
export const DraftReplyDrafted = ({
  body,
  sending,
  error,
  onRegenerate,
  onSend,
  onSendAndArchive,
  onEdit,
}: Props) => (
  <DraftReplyShell
    header={
      <>
        <Sparkles className="text-gousse-muted" aria-hidden />
        <span className="font-semibold text-gousse-primary">Draft reply</span>
        <span className="text-gousse-muted">with AI</span>
      </>
    }
    aside={
      sending ? null : (
        <button
          type="button"
          onClick={onRegenerate}
          className="font-medium text-gousse-muted hover:text-gousse-ink"
        >
          Regenerate
        </button>
      )
    }
  >
    <p
      className={`text-sm leading-[22px] whitespace-pre-wrap ${sending ? "text-gousse-muted" : "text-gousse-ink"}`}
    >
      {body}
    </p>
    {error ? (
      <p role="alert" className="text-xs text-gousse-error">
        Not sent — {apiErrorMessage(error)}
      </p>
    ) : null}
    <div className="flex items-center gap-2">
      <AppButton tone="primary" onClick={onSend} disabled={sending}>
        {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        {sending ? "Sending…" : "Send"}
      </AppButton>
      <AppButton tone="secondary" onClick={onEdit} disabled={sending}>
        <Pencil aria-hidden />
        Edit
      </AppButton>
      <span className="flex-1" />
      <AppButton tone="ghost" onClick={onSendAndArchive} disabled={sending} className="font-medium">
        <Archive aria-hidden />
        Send &amp; archive
      </AppButton>
    </div>
  </DraftReplyShell>
);
