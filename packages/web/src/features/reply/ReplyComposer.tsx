import { useState } from "react";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";
import {
  useGenerateReply,
  useSendReply,
} from "../../api/mutations";
import { ApiError } from "../../api/client";
import type { MessageDetail } from "../../api/types";
import { ReplyDraftView } from "./ReplyDraftView";

interface Props {
  message: MessageDetail;
}

interface Draft {
  subject: string;
  body: string;
  model: string;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const ReplyComposer = ({ message }: Props) => {
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sentMessageId, setSentMessageId] = useState<string | null>(null);

  const generate = useGenerateReply();
  const send = useSendReply();

  const input = {
    accountId: message.accountId,
    gmailMessageId: message.gmailMessageId,
  };

  const onGenerate = () => {
    if (!prompt.trim()) return;
    setSentMessageId(null);
    generate.mutate(
      { ...input, prompt },
      {
        onSuccess: (data) => {
          setDraft({ subject: data.subject, body: data.body, model: data.model });
        },
      },
    );
  };

  const onSend = () => {
    if (!draft) return;
    send.mutate(
      { ...input, subject: draft.subject, body: draft.body },
      {
        onSuccess: (data) => {
          setSentMessageId(data.sentMessageId);
        },
      },
    );
  };

  const onDiscard = () => {
    setDraft(null);
    setSentMessageId(null);
    send.reset();
    generate.reset();
  };

  const canGenerate = prompt.trim().length > 0 && !generate.isPending;

  return (
    <section className="flex flex-col gap-3 rounded-md border border-miel-line bg-miel-panel p-3">
      <h2 className="text-sm font-semibold text-miel-ink">Reply</h2>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-miel-muted">
          Instruction for Claude
        </span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Decline politely; I'm on vacation until June."
          rows={3}
          className="rounded border border-miel-line bg-white px-2 py-1.5 text-sm text-miel-ink focus:border-miel-ink focus:outline-none"
          disabled={generate.isPending}
        />
      </label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={!canGenerate}
          onClick={onGenerate}
        >
          {generate.isPending ? <Spinner /> : null}
          {draft ? "Regenerate" : "Generate"}
        </Button>
        {generate.isPending ? (
          <span className="text-xs text-miel-muted">
            Asking Claude for a draft…
          </span>
        ) : null}
      </div>
      {generate.error ? (
        <p className="text-xs text-miel-high">
          Generation failed: {describeError(generate.error)}
        </p>
      ) : null}
      {draft ? (
        <ReplyDraftView
          subject={draft.subject}
          body={draft.body}
          model={draft.model}
          onSubjectChange={(subject) =>
            setDraft((prev) => (prev ? { ...prev, subject } : prev))
          }
          onBodyChange={(body) =>
            setDraft((prev) => (prev ? { ...prev, body } : prev))
          }
          onSend={onSend}
          onDiscard={onDiscard}
          isSending={send.isPending}
          sendError={send.error}
          sentMessageId={sentMessageId}
        />
      ) : null}
    </section>
  );
};
