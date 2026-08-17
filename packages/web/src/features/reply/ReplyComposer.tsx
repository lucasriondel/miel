import { useEffect, useRef, useState } from "react";
import { useGenerateReply, useSendReply } from "../../api/mutations";
import type { MessageDetail } from "../../api/types";
import { ComposeBodyField } from "../compose/ComposeBodyField";
import { ComposeFooter } from "../compose/ComposeFooter";
import { ComposeHeaderFields } from "../compose/ComposeHeaderFields";
import { ComposeWindow } from "../compose/ComposeWindow";
import { composeWindowMode, type ComposeWindowMode } from "../compose/composeWindowState";
import { invalidAddresses, parseAddressList } from "../compose/recipients";
import { ReplyPills } from "./ReplyPills";
import { ReplyPromptSection } from "./ReplyPromptSection";
import { replySubject, replyToLine, replyWindowTitle } from "./replyDefaults";

interface Props {
  message: MessageDetail;
  /**
   * Bumped by an outside opener (the top bar's Reply button) to open the
   * window. A counter rather than a boolean: the window can be discarded while
   * the button stays mounted, and a boolean stuck at `true` could never reopen
   * it. Every increment is one fresh request to open.
   */
  openSignal?: number;
}

/**
 * Reply, as a floating compose window (#96).
 *
 * At rest the page shows two pills (#91); either one opens the same window,
 * docked bottom-right and floating over the page instead of sitting in it. What
 * is reply-specific lives here — the prefilled recipients and subject, the AI
 * instruction, the two mutations — and everything the window itself is
 * (`../compose`) knows nothing about a message being answered, so a future
 * blank Compose entry point mounts the same shell with an empty form.
 *
 * Which of the three states the window is in is derived, not stored:
 * `composeWindowMode` folds the user's intent together with "is there anything
 * unsent", so a window holding a draft or typed text cannot fall shut. Discard
 * is the one way back to the pills, because it clears both halves at once —
 * minimize deliberately does not, which is what makes it safe to press.
 */
export const ReplyComposer = ({ message, openSignal = 0 }: Props) => {
  const [intent, setIntent] = useState<ComposeWindowMode>("closed");
  const lastOpenSignal = useRef(openSignal);
  const [autoFocusPrompt, setAutoFocusPrompt] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [sentMessageId, setSentMessageId] = useState<string | null>(null);

  const generate = useGenerateReply();
  const send = useSendReply();

  const input = {
    accountId: message.accountId,
    gmailMessageId: message.gmailMessageId,
  };

  const isBusy = generate.isPending || send.isPending;
  const mode = composeWindowMode(intent, {
    prompt,
    body,
    hasDraft: model !== null,
    isBusy,
    sentMessageId,
  });

  const open = (withClaude: boolean) => {
    // A window that is only minimized is restored, not reset: the whole point
    // of minimizing is that the draft survives it.
    if (mode === "closed") {
      setTo(replyToLine(message));
      setCc("");
      setSubject(replySubject(message.subject));
      setBody("");
      setPrompt("");
      setModel(null);
      setSentMessageId(null);
      send.reset();
      generate.reset();
    }
    setIntent("open");
    setAutoFocusPrompt(withClaude);
  };

  const onDiscard = () => {
    setIntent("closed");
    setAutoFocusPrompt(false);
    setPrompt("");
    setBody("");
    setModel(null);
    setSentMessageId(null);
    send.reset();
    generate.reset();
  };

  const onGenerate = () => {
    if (!prompt.trim()) return;
    setSentMessageId(null);
    generate.mutate(
      { ...input, prompt },
      {
        onSuccess: (data) => {
          setSubject(data.subject);
          setBody(data.body);
          setModel(data.model);
        },
      },
    );
  };

  const recipients = parseAddressList(to);
  const copies = parseAddressList(cc);
  const canSend =
    recipients.length > 0 &&
    invalidAddresses(to).length === 0 &&
    invalidAddresses(cc).length === 0 &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !isBusy;

  const onSend = () => {
    if (!canSend) return;
    send.mutate(
      {
        ...input,
        subject,
        body,
        to: recipients,
        // Omitted rather than empty: an empty Cc is no Cc, and the request
        // schema treats a named list as one the sender meant.
        ...(copies.length > 0 ? { cc: copies } : {}),
      },
      {
        onSuccess: (data) => {
          setSentMessageId(data.sentMessageId);
        },
      },
    );
  };

  // The top bar's Reply button opens the window from anywhere on the page. It
  // opens plain rather than with the AI prompt focused — the bar's button is
  // "reply", the sparkle pill is "draft with AI".
  useEffect(() => {
    if (openSignal === lastOpenSignal.current) return;
    lastOpenSignal.current = openSignal;
    open(false);
    // `open` closes over this render's state; re-running on every change would
    // reopen a window the user just discarded.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [openSignal]);

  if (mode === "closed") {
    return <ReplyPills onReply={() => open(false)} onDraftWithClaude={() => open(true)} />;
  }

  const title = replyWindowTitle(message.subject);
  const isSent = sentMessageId !== null;

  return (
    <ComposeWindow
      title={title}
      label={`Reply: ${title}`}
      minimized={mode === "minimized"}
      onMinimize={() => setIntent("minimized")}
      onRestore={() => setIntent("open")}
      onClose={onDiscard}
      closeLabel="Close"
    >
      <ComposeHeaderFields
        to={to}
        cc={cc}
        subject={subject}
        onToChange={setTo}
        onCcChange={setCc}
        onSubjectChange={setSubject}
        disabled={send.isPending || isSent}
      />
      <ComposeBodyField
        body={body}
        onBodyChange={setBody}
        disabled={send.isPending || generate.isPending || isSent}
      />
      <ReplyPromptSection
        prompt={prompt}
        onPromptChange={setPrompt}
        onGenerate={onGenerate}
        isGenerating={generate.isPending}
        isBusy={isBusy}
        hasDraft={model !== null}
        error={generate.error}
        // Forwarded, not decided here — ReplyPromptSection carries the reasoning.
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- see above
        autoFocus={autoFocusPrompt}
      />
      <ComposeFooter
        canSend={canSend && !isSent}
        isSending={send.isPending}
        sendError={send.error}
        sentMessageId={sentMessageId}
        onSend={onSend}
        onDiscard={onDiscard}
      />
    </ComposeWindow>
  );
};
