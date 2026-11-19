import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cancelScheduledSendRequest } from "../../api/compose.hooks";
import { composeErrorMessage } from "../../api/apiErrorMessage";
import { useMessageQuote, useSendAs } from "../../api/composeReads.hooks";
import { useAccounts } from "../../api/queries";
import { ForwardedBlock } from "../reply/ForwardedBlock";
import { QuotedThread } from "../reply/QuotedThread";
import { ReplyModeChip } from "../reply/ReplyModeChip";
import { replyModeOptions } from "../reply/replyModeSwitch";
import { presetTimeLabel } from "../time/timePresets";
import { AiInstructionStrip } from "./AiInstructionStrip";
import { AttachmentChips } from "./AttachmentChips";
import { CcBccToggles } from "./CcBccToggles";
import { ComposeAddressRow } from "./ComposeAddressRow";
import { ComposeBodyField } from "./ComposeBodyField";
import { ComposeFooter } from "./ComposeFooter";
import { ComposeFromRow } from "./ComposeFromRow";
import type { ComposeSessionActions, FieldsPatch } from "./ComposeProvider";
import { isBlank, sessionTitle, type ComposeSession } from "./composeSession";
import { clockTime, composeShortcut, gmailThreadUrl } from "./composeShortcuts";
import { ComposeSubjectRow } from "./ComposeSubjectRow";
import { ComposeWindow } from "./ComposeWindow";
import { composeWindowMode } from "./composeWindowState";
import { DiscardConfirmFooter } from "./DiscardConfirmFooter";
import { DropOverlay } from "./DropOverlay";
import { fromOptions, selectedFrom } from "./fromOptions";
import { SendErrorBanner } from "./SendErrorBanner";
import { SentFooter } from "./SentFooter";
import { useAttachmentUploads } from "./useAttachmentUploads";
import { useComposeAi } from "./useComposeAi";
import { sentToLabel, useComposeSend } from "./useComposeSend";
import { useDraftAutosave } from "./useDraftAutosave";
import { useFileDrop } from "./useFileDrop";

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
 * the From menu, the files, the quote or forwarded block under the body, the AI
 * strip, the autosave, the send — now or scheduled — and the keys.
 *
 * Whether it may close is derived, not stored (`composeWindowMode`): pressing
 * close or the bin is a *request*, and a window holding unsent work answers it
 * by staying open and asking in its footer. Minimize is never overridden — it
 * is an explicit request to keep the draft and get it out of the way.
 */
export const ComposeSessionWindow = ({ session, actions, draftSaveDelayMs }: Props) => {
  const { id, fields, kind, message } = session;
  const update = useCallback((patch: FieldsPatch) => actions.update(id, patch), [actions, id]);
  const stripInput = useRef<HTMLInputElement>(null);
  const [closeRequested, setCloseRequested] = useState(false);

  // What the window answers, as the server will send it.
  const answering = message && kind !== "new" ? message : null;
  const quote = useMessageQuote(
    answering ? { accountId: answering.accountId, gmailMessageId: answering.gmailMessageId } : null,
  );
  // The original's files a forward carries — counted for the mode menu whatever
  // the mode, drawn and sent only on a forward.
  const forwardable = useMemo(
    () =>
      (quote.data?.attachments ?? []).filter(
        (a) => !fields.droppedAttachmentIds.includes(a.attachmentId),
      ),
    [quote.data, fields.droppedAttachmentIds],
  );
  const originals = kind === "forward" ? forwardable : [];

  // Who it goes from.
  const accounts = useAccounts();
  const sendAs = useSendAs(session.accountId);
  const options = useMemo(
    () =>
      fromOptions({
        kind,
        windowAccountId: session.accountId,
        accounts: accounts.data ?? [],
        aliases: sendAs.data?.aliases ?? [],
      }),
    [kind, session.accountId, accounts.data, sendAs.data],
  );
  const from = selectedFrom(options, fields.fromAccountId, fields.fromAlias);
  const sender = accounts.data?.find((a) => a.id === fields.fromAccountId);

  const uploads = useAttachmentUploads({
    uploads: fields.uploads,
    accountId: fields.fromAccountId,
    update,
  });

  const flushDraft = useRef<() => Promise<string | undefined>>(async () => undefined);
  const send = useComposeSend({
    session,
    flushDraft: () => flushDraft.current(),
    waitForUploads: uploads.waitForUploads,
    keptAttachmentIds:
      kind === "forward" ? (quote.data ? originals.map((a) => a.attachmentId) : null) : null,
    keptAttachmentBytes: originals.reduce((sum, a) => sum + a.size, 0),
  });
  const ai = useComposeAi({ session, initialBody: "", update });

  const worthSaving =
    fields.body.trim().length > 0 ||
    fields.uploads.length > 0 ||
    (kind === "new" && !isBlank(fields));
  const draft = useDraftAutosave({
    session,
    enabled: !send.sending && send.sent === null && send.scheduled === null && !closeRequested,
    worthSaving,
    delayMs: draftSaveDelayMs,
    update,
  });
  useEffect(() => {
    flushDraft.current = draft.flush;
  }, [draft.flush]);

  const mode = composeWindowMode(closeRequested ? "closed" : session.intent, {
    prompt: fields.prompt,
    body: fields.body,
    hasDraft: ai.draftedFrom !== null || draft.draftId !== null || fields.uploads.length > 0,
    isBusy: ai.status === "generating" || send.sending,
    sentMessageId: send.sent ? send.sent.threadId : null,
    addressed: kind === "new" && !isBlank(fields),
  });

  // Nothing to lose: a requested close simply closes.
  useEffect(() => {
    if (mode === "closed") actions.remove(id);
  }, [mode, actions, id]);

  const discard = () => {
    void draft.discard();
    uploads.discardAll();
    actions.remove(id);
  };

  const requestClose = () => {
    if (send.sending) return;
    if (send.sent) {
      actions.remove(id);
      return;
    }
    setCloseRequested(true);
    if (session.intent === "minimized") actions.restore(id);
  };

  /**
   * Scheduled: the window closes and a toast takes its place, with Undo — which
   * cancels the held send and puts the window back as it was, draft included.
   */
  const schedule = async (at: Date) => {
    const snapshot = session;
    const record = await send.schedule(at);
    if (!record) return;
    const draftId = await draft.flush();
    actions.remove(id);
    toast(`Scheduled for ${presetTimeLabel(record.sendAt, new Date())}`, {
      action: {
        label: "Undo",
        onClick: () => {
          void cancelScheduledSendRequest(record.id)
            .then(() =>
              actions.reopen({
                ...snapshot,
                fields: { ...snapshot.fields, draftId: draftId ?? snapshot.fields.draftId },
              }),
            )
            .catch((err: unknown) => toast.error(composeErrorMessage(err)));
        },
      },
    });
  };

  const drop = useFileDrop(uploads.attach);

  const canArchive = (kind === "reply" || kind === "replyAll") && message !== null;
  const locked = send.sending || send.sent !== null;

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const shortcut = composeShortcut(e);
    if (!shortcut) return;
    if (shortcut === "escape") {
      if (e.defaultPrevented) return;
      if (ai.status === "generating") ai.stop();
      else actions.minimize(id);
    } else if (shortcut === "send") {
      void send.send(false);
    } else if (shortcut === "sendArchive") {
      if (canArchive) void send.send(true);
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

  const names = { ...session.names, ...fields.contactNames };
  const modeChip =
    answering && kind !== "new" ? (
      <ReplyModeChip
        mode={kind}
        options={replyModeOptions(answering, kind, names, forwardable.length)}
        onPick={(next) => actions.switchMode(id, next)}
        disabled={locked}
      />
    ) : null;

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
  const onName = (email: string, name: string) =>
    update((f) => ({ contactNames: { ...f.contactNames, [email.toLowerCase()]: name } }));
  const senderEmail = sender?.email ?? session.accountEmail;

  return (
    <ComposeWindow
      title={send.sending && mode === "minimized" ? "Sending…" : title}
      label={`${LABEL_PREFIX[kind]}${title}`}
      minimized={mode === "minimized"}
      status={
        send.sending ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gousse-muted" aria-hidden />
        ) : fields.body.trim() || fields.prompt.trim() ? (
          <span aria-label="Unsent" className="h-2 w-2 shrink-0 rounded-full bg-gousse-medium" />
        ) : null
      }
      onMinimize={() => actions.minimize(id)}
      onRestore={() => actions.restore(id)}
      onClose={requestClose}
      onKeyDown={onKeyDown}
      titleLeading={modeChip}
    >
      <div className="relative flex min-h-0 flex-1 flex-col" {...(locked ? {} : drop.handlers)}>
        {drop.over ? <DropOverlay /> : null}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <ComposeFromRow
            options={options}
            selected={from}
            fallbackName={session.accountName}
            fallbackEmail={session.accountEmail}
            disabled={locked}
            onPick={(option) =>
              update({ fromAccountId: option.accountId, fromAlias: option.alias })
            }
          />
          <ComposeAddressRow
            label="To"
            accountId={fields.fromAccountId}
            entries={fields.to}
            names={names}
            onChange={(to) => update({ to })}
            onName={onName}
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
              accountId={fields.fromAccountId}
              entries={fields.cc}
              names={names}
              onChange={(cc) => update({ cc })}
              onName={onName}
              disabled={locked}
            />
          ) : null}
          {showBcc ? (
            <ComposeAddressRow
              label="Bcc"
              accountId={fields.fromAccountId}
              entries={fields.bcc}
              names={names}
              onChange={(bcc) => update({ bcc })}
              onName={onName}
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
            placeholder={kind === "forward" ? "Add a message…" : undefined}
          />
          {kind === "reply" || kind === "replyAll" ? (
            <QuotedThread
              quote={quote.data?.reply ?? null}
              quotedText={fields.quotedText}
              onTrim={(quotedText) => update({ quotedText })}
              disabled={locked}
            />
          ) : null}
          {kind === "forward" ? (
            <ForwardedBlock block={quote.data?.forward ?? null} loading={quote.isPending} />
          ) : null}
          <AttachmentChips
            originals={originals}
            uploads={fields.uploads}
            locked={locked}
            onRemoveOriginal={(attachmentId) =>
              update((f) => ({ droppedAttachmentIds: [...f.droppedAttachmentIds, attachmentId] }))
            }
            onRemoveUpload={uploads.remove}
          />
        </div>
        <AiInstructionStrip
          status={ai.status}
          prompt={fields.prompt}
          onPromptChange={(prompt) => update({ prompt })}
          draftedFrom={ai.draftedFrom}
          error={ai.error}
          onRun={(instruction, force) => void ai.run(instruction, force)}
          onRefine={(refinement, shown) => void ai.refine(refinement, shown)}
          onStop={ai.stop}
          onKeepMine={ai.keepMine}
          locked={locked}
          inputRef={stripInput}
          focusOnMount={session.focusInstruction}
        />
        {send.error && !send.sending ? <SendErrorBanner error={send.error} /> : null}
        {send.sent ? (
          <SentFooter
            summary={`Sent to ${sentToLabel(session)} · ${clockTime(send.sent.at)}${
              send.sent.archived ? " · archived" : ""
            }`}
            href={send.sent.threadId ? gmailThreadUrl(senderEmail, send.sent.threadId) : null}
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
            blocker={send.blocker}
            sending={send.sending}
            failed={send.error !== null}
            draftLine={draftLine}
            onSend={() => void send.send(false)}
            onSendAndArchive={canArchive ? () => void send.send(true) : undefined}
            onSchedule={send.canSchedule ? (at) => void schedule(at) : undefined}
            onAttach={uploads.attach}
            onDiscard={requestClose}
          />
        )}
      </div>
    </ComposeWindow>
  );
};
