import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  generateReplyMutationOptions,
  sendReplyMutationOptions,
  useArchiveMessage,
} from "../../api/mutations";
import type { MessageDetail } from "../../api/types";
import { useCompose } from "../compose/ComposeProvider";
import { clockTime, gmailThreadUrl } from "../compose/composeShortcuts";
import { DEFAULT_DRAFT_PROMPT } from "./draftReply";
import { DraftReplyDrafted } from "./DraftReplyDrafted";
import { DraftReplyFailed } from "./DraftReplyFailed";
import { DraftReplyGenerating } from "./DraftReplyGenerating";
import { DraftReplySent } from "./DraftReplySent";
import { replySubject } from "./replyDefaults";
import { ReplyPills } from "./ReplyPills";

type CardState =
  | { kind: "rest" }
  | { kind: "generating" }
  | { kind: "failed"; error: unknown }
  | { kind: "drafted"; body: string; subject: string; sending: boolean; error: unknown }
  | { kind: "sent"; body: string; at: Date; threadId: string; archived: boolean };

/**
 * The draft card's lifecycle. On demand only: nothing is drafted until the
 * user presses Draft with AI — a draft is a body-bearing call to the provider,
 * and a reader that made one per opened message would spend it on mail nobody
 * answers.
 *
 * Send goes as a plain reply to the sender (the server's own default), Edit
 * hands the draft to a compose window where the recipients and the wording can
 * be changed, and Send & archive files the message once the reply is out.
 */
export const DraftReplyCardBody = ({ message }: { message: MessageDetail }) => {
  const qc = useQueryClient();
  const archive = useArchiveMessage();
  const { openReply } = useCompose();
  const [state, setState] = useState<CardState>({ kind: "rest" });
  const target = { accountId: message.accountId, gmailMessageId: message.gmailMessageId };

  const draft = async () => {
    setState({ kind: "generating" });
    try {
      const result = await generateReplyMutationOptions().mutationFn({
        ...target,
        prompt: DEFAULT_DRAFT_PROMPT,
      });
      setState({
        kind: "drafted",
        body: result.body,
        subject: result.subject || replySubject(message.subject),
        sending: false,
        error: null,
      });
    } catch (error) {
      setState({ kind: "failed", error });
    }
  };

  const send = async (andArchive: boolean) => {
    if (state.kind !== "drafted" || state.sending) return;
    const drafted = state;
    setState({ ...drafted, sending: true, error: null });
    try {
      const result = await sendReplyMutationOptions(qc).mutationFn({
        ...target,
        subject: drafted.subject,
        body: drafted.body,
      });
      if (andArchive) archive.mutate(target);
      void qc.invalidateQueries({ queryKey: ["messages"] });
      setState({
        kind: "sent",
        body: drafted.body,
        at: new Date(),
        threadId: result.threadId,
        archived: andArchive,
      });
    } catch (error) {
      setState({ ...drafted, sending: false, error });
    }
  };

  switch (state.kind) {
    case "rest":
      return (
        <ReplyPills
          onReply={() => openReply(message, "reply")}
          onDraftWithClaude={() => void draft()}
        />
      );
    case "generating":
      return <DraftReplyGenerating />;
    case "failed":
      return (
        <DraftReplyFailed
          error={state.error}
          onRetry={() => void draft()}
          onReply={() => openReply(message, "reply")}
        />
      );
    case "drafted":
      return (
        <DraftReplyDrafted
          body={state.body}
          sending={state.sending}
          error={state.error}
          onRegenerate={() => void draft()}
          onSend={() => void send(false)}
          onSendAndArchive={() => void send(true)}
          onEdit={() => {
            openReply(message, "reply", { body: state.body, prompt: DEFAULT_DRAFT_PROMPT });
            setState({ kind: "rest" });
          }}
        />
      );
    case "sent":
      return (
        <DraftReplySent
          body={state.body}
          summary={`· ${clockTime(state.at)}${state.archived ? " · archived" : ""}`}
          href={state.threadId ? gmailThreadUrl(message.accountEmail, state.threadId) : null}
        />
      );
  }
};
