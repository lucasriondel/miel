import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";
import { forwardBody } from "../reply/replyDefaults";
import { AiInstructionStrip } from "./AiInstructionStrip";
import { CcBccToggles } from "./CcBccToggles";
import { ComposeAddressRow } from "./ComposeAddressRow";
import { ComposeBodyField } from "./ComposeBodyField";
import { ComposeFooter } from "./ComposeFooter";
import { ComposeFromRow } from "./ComposeFromRow";
import type { ComposeSessionActions } from "./ComposeProvider";
import { isBlank, sessionTitle, type ComposeFields, type ComposeSession } from "./composeSession";
import { clockTime, composeShortcut, gmailThreadUrl } from "./composeShortcuts";
import { ComposeSubjectRow } from "./ComposeSubjectRow";
import { ComposeWindow } from "./ComposeWindow";
import { composeWindowMode } from "./composeWindowState";
import { DiscardConfirmFooter } from "./DiscardConfirmFooter";
import { SendErrorBanner } from "./SendErrorBanner";
import { SentFooter } from "./SentFooter";
import { useComposeAi } from "./useComposeAi";
import { sentToLabel, useComposeSend } from "./useComposeSend";
import { useDraftAutosave } from "./useDraftAutosave";

interface Props {
  session: ComposeSession;
  actions: ComposeSessionActions;
  draftSaveDelayMs: number;
}

const LABEL_PREFIX: Record<ComposeSession["kind"], string> = {
  new: "",
  reply: "Reply: ",
  replyAll: "Reply all: ",
  forward: "Forward: ",
};

/**
 * One docked window and everything it does: the fields (held by the provider),
 * the AI strip, the autosave, the send, and the keys.
 *
 * Whether it may close is derived, not stored (`composeWindowMode`): pressing
 * close or the bin is a *request*, and a window holding unsent work answers it
 * by staying open and asking in its footer. Minimize is never overridden — it
 * is an explicit request to keep the draft and get it out of the way.
 */
export const ComposeSessionWindow = ({ session, actions, draftSaveDelayMs }: Props) => {
  const { id, fields, kind, message } = session;
  const update = useCallback(
    (patch: Partial<ComposeFields>) => actions.update(id, patch),
    [actions, id],
  );
  const initialBody = useMemo(
    () => (kind === "forward" && message ? forwardBody(message) : ""),
    [kind, message],
  );
  const stripInput = useRef<HTMLInputElement>(null);
  const [closeRequested, setCloseRequested] = useState(false);

  const flushDraft = useRef<() => Promise<string | undefined>>(async () => undefined);
  const sender = useComposeSend({ session, flushDraft: () => flushDraft.current() });
  const ai = useComposeAi({ session, initialBody, update });

  const typedBody = fields.body.trim() === initialBody.trim() ? "" : fields.body;
  const worthSaving = typedBody.trim().length > 0 || (kind === "new" && !isBlank(fields));
  const draft = useDraftAutosave({
    session,
    enabled: !sender.sending && sender.sent === null && !closeRequested,
    worthSaving,
    delayMs: draftSaveDelayMs,
  });
  useEffect(() => {
    flushDraft.current = draft.flush;
  }, [draft.flush]);

  const mode = composeWindowMode(closeRequested ? "closed" : session.intent, {
    prompt: fields.prompt,
    body: typedBody,
    hasDraft: ai.draftedFrom !== null || draft.draftId !== null,
    isBusy: ai.status === "generating" || sender.sending,
    sentMessageId: sender.sent ? sender.sent.threadId : null,
    addressed: kind === "new" && !isBlank(fields),
  });

  // Nothing to lose: a requested close simply closes.
  useEffect(() => {
    if (mode === "closed") actions.remove(id);
  }, [mode, actions, id]);

  const discard = () => {
    void draft.discard();
    actions.remove(id);
  };

  const requestClose = () => {
    if (sender.sending) return;
    if (sender.sent) {
      actions.remove(id);
      return;
    }
    setCloseRequested(true);
    if (session.intent === "minimized") actions.restore(id);
  };

  const canArchive = (kind === "reply" || kind === "replyAll") && message !== null;
  const locked = sender.sending || sender.sent !== null;

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const shortcut = composeShortcut(e);
    if (!shortcut) return;
    if (shortcut === "escape") {
      if (e.defaultPrevented) return;
      if (ai.status === "generating") ai.stop();
      else actions.minimize(id);
    } else if (shortcut === "send") {
      void sender.send(false);
    } else if (shortcut === "sendArchive") {
      if (canArchive) void sender.send(true);
    } else if (shortcut === "ai") {
      if (locked || ai.status === "generating") return;
      if (ai.status === "confirm") ai.run(fields.prompt, true);
      else if (fields.prompt.trim()) ai.run(fields.prompt);
      else stripInput.current?.focus();
    } else if (shortcut === "discard") {
      requestClose();
    }
    e.preventDefault();
  };

  const title = sessionTitle(session);
  const confirming = closeRequested && mode !== "closed";
  const draftLine =
    draft.status === "saving"
      ? "Saving draft…"
      : draft.status === "saved" && draft.savedAt
        ? `Saved to Gmail drafts · ${clockTime(draft.savedAt)}`
        : draft.status === "failed"
          ? "Draft not saved"
          : null;

  const showCc = fields.showCc || fields.cc.length > 0;
  const showBcc = fields.showBcc || fields.bcc.length > 0;

  return (
    <ComposeWindow
      title={sender.sending && mode === "minimized" ? "Sending…" : title}
      label={`${LABEL_PREFIX[kind]}${title}`}
      minimized={mode === "minimized"}
      status={
        sender.sending ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gousse-muted" aria-hidden />
        ) : typedBody.trim() || fields.prompt.trim() ? (
          <span aria-label="Unsent" className="h-2 w-2 shrink-0 rounded-full bg-gousse-medium" />
        ) : null
      }
      onMinimize={() => actions.minimize(id)}
      onRestore={() => actions.restore(id)}
      onClose={requestClose}
      onKeyDown={onKeyDown}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <ComposeFromRow accountName={session.accountName} accountEmail={session.accountEmail} />
        <ComposeAddressRow
          label="To"
          entries={fields.to}
          names={session.names}
          onChange={(to) => update({ to })}
          disabled={locked}
          focusOnMount={kind === "new" || kind === "forward"}
          trailing={
            <CcBccToggles
              showCc={showCc}
              showBcc={showBcc}
              onShowCc={() => update({ showCc: true })}
              onShowBcc={() => update({ showBcc: true })}
            />
          }
        />
        {showCc ? (
          <ComposeAddressRow
            label="Cc"
            entries={fields.cc}
            names={session.names}
            onChange={(cc) => update({ cc })}
            disabled={locked}
          />
        ) : null}
        {showBcc ? (
          <ComposeAddressRow
            label="Bcc"
            entries={fields.bcc}
            names={session.names}
            onChange={(bcc) => update({ bcc })}
            disabled={locked}
          />
        ) : null}
        <ComposeSubjectRow
          subject={fields.subject}
          onChange={(subject) => update({ subject })}
          disabled={locked}
        />
        <ComposeBodyField
          body={fields.body}
          onBodyChange={(body) => update({ body })}
          disabled={locked}
          drafting={ai.status === "generating"}
          focusOnMount={(kind === "reply" || kind === "replyAll") && !session.focusInstruction}
        />
      </div>
      <AiInstructionStrip
        status={ai.status}
        prompt={fields.prompt}
        onPromptChange={(prompt) => update({ prompt })}
        draftedFrom={ai.draftedFrom}
        error={ai.error}
        onRun={(instruction, force) => void ai.run(instruction, force)}
        onStop={ai.stop}
        onKeepMine={ai.keepMine}
        locked={locked}
        inputRef={stripInput}
        focusOnMount={session.focusInstruction}
      />
      {sender.error && !sender.sending ? <SendErrorBanner error={sender.error} /> : null}
      {sender.sent ? (
        <SentFooter
          summary={`Sent to ${sentToLabel(session)} · ${clockTime(sender.sent.at)}${
            sender.sent.archived ? " · archived" : ""
          }`}
          href={
            sender.sent.threadId ? gmailThreadUrl(session.accountEmail, sender.sent.threadId) : null
          }
          onClose={() => actions.remove(id)}
        />
      ) : confirming ? (
        <DiscardConfirmFooter
          hasDraft={draft.draftId !== null}
          onKeep={() => setCloseRequested(false)}
          onDiscard={discard}
        />
      ) : (
        <ComposeFooter
          blocker={sender.blocker}
          sending={sender.sending}
          failed={sender.error !== null}
          draftLine={draftLine}
          onSend={() => void sender.send(false)}
          onSendAndArchive={canArchive ? () => void sender.send(true) : undefined}
          onDiscard={requestClose}
        />
      )}
    </ComposeWindow>
  );
};
