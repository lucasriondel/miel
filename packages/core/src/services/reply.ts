// Writing mail: drafting a reply or a new message with the model, and sending
// either through Gmail.
//
// Storage is reached through the store seam (`MessageStore`): the message being
// answered and the account sending are rows of the mailbox read model, so a
// suite runs this against the in-memory mailbox. Gmail is reached through the
// `GmailDataAdapter`, and the model through the `Claude` tag — the three seams
// a test substitutes.
import { Effect } from "effect";
import { createGmailAdapter, type GmailDataAdapter } from "../google/gmailAdapter";
import { Claude, ClaudeLive } from "../claude/Claude";
import { ComposeRefusedError } from "../errors";
import { type ReplyGenOutputT } from "../schemas/reply";
import { MessageStore, type Stores, type StoredMessage } from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { createDebug } from "../util/debug";
import { tryAsync } from "../util/effect";
import {
  checkAttachmentSizeEffect,
  cleanList,
  loadForwardedAttachmentsEffect,
  loadUploadsEffect,
  recordRecipientsEffect,
  resolveAccountEffect,
  resolveFromEffect,
  resolveMessageEffect,
  type AccountArgs,
} from "./outgoing";
import {
  forwardBlock,
  replyQuote,
  withBlock,
  type QuoteBlock,
  type QuotedOriginal,
} from "./quoting";
import { ccFromHeaders, resolveReplyRecipients } from "./replyRecipients";
import { runCancellable, type Cancellation } from "./generations";
// Shared with the landing page's Claude disclosure, so the published figure and
// the one actually applied here cannot drift apart.
import { REPLY_BODY_TRUNCATION as BODY_TRUNCATION } from "../claudeUsage";

const debug = createDebug("service:reply");

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

/**
 * The draft being refined: what the compose window holds when the user
 * presses "Shorter", "Warmer" or types a follow-up instruction. Handed to the
 * model so a refinement edits the draft instead of drafting again from scratch.
 * It is the user's own text (or the model's last answer), never a received
 * body, so it does not make a call body-bearing.
 */
export interface PreviousDraft {
  subject?: string;
  body: string;
}

const previousDraftInput = (draft: PreviousDraft | undefined) =>
  draft && draft.body.trim().length > 0
    ? { previousDraft: { subject: draft.subject ?? null, body: draft.body } }
    : {};

export interface GenerateReplyArgs extends AccountArgs {
  gmailMessageId: string;
  prompt: string;
  previousDraft?: PreviousDraft;
}

export interface GenerateReplyResult {
  subject: string;
  body: string;
  model: string;
  runId: string;
}

export const generateReplyEffect = (
  args: GenerateReplyArgs,
): Effect.Effect<GenerateReplyResult, Error, Claude | MessageStore> =>
  Effect.gen(function* () {
    debug("generateReply", {
      gmailMessageId: args.gmailMessageId,
      accountEmail: args.accountEmail,
      promptLen: args.prompt.length,
      refining: Boolean(args.previousDraft),
    });
    const claude = yield* Claude;
    const msg = yield* resolveMessageEffect(args);
    const { output, model, runId } = yield* claude.run("reply", {
      from: msg.fromEmail,
      to: msg.toEmails,
      subject: msg.subject,
      body: truncate(msg.bodyText ?? "", BODY_TRUNCATION),
      userInstruction: args.prompt,
      ...previousDraftInput(args.previousDraft),
    });
    debug("generateReply done", {
      gmailMessageId: args.gmailMessageId,
      subject: output.subject,
      bodyLen: output.body.length,
      runId,
      model,
    });
    return { subject: output.subject, body: output.body, model, runId };
  });

export interface GenerateNewMessageArgs extends AccountArgs {
  prompt: string;
  /** Recipients already typed, as a hint. */
  to?: string[];
  /** A subject already typed, kept by the model when present. */
  subject?: string;
  previousDraft?: PreviousDraft;
}

/**
 * Drafting a new message — the compose window with nothing behind it.
 *
 * The `reply` task, run with no source message: the model is given the sending
 * mailbox, whatever the user has typed so far, and the instruction. Nothing a
 * correspondent wrote is in the prompt, so this is not a body-bearing call.
 */
export const generateNewMessageEffect = (
  args: GenerateNewMessageArgs,
): Effect.Effect<GenerateReplyResult, Error, Claude | MessageStore> =>
  Effect.gen(function* () {
    debug("generateNewMessage", { accountId: args.accountId, promptLen: args.prompt.length });
    const claude = yield* Claude;
    const account = yield* resolveAccountEffect(args);
    const subject = args.subject?.trim();
    const { output, model, runId } = yield* claude.run("reply", {
      sender: account.email,
      to: cleanList(args.to),
      subject: subject ? subject : null,
      userInstruction: args.prompt,
      ...previousDraftInput(args.previousDraft),
    });
    debug("generateNewMessage done", { subject: output.subject, runId, model });
    return { subject: output.subject, body: output.body, model, runId };
  });

/** What a send answers, reply or new. */
export interface SendMessageResult {
  ok: true;
  sentMessageId: string;
  /**
   * The thread Gmail filed it in — the conversation for a reply, a fresh one
   * for a new message. A client builds its "View in Gmail" link from it.
   */
  threadId: string;
}

/** The name from before compose, kept for its callers; the shape is the same. */
export type SendReplyResult = SendMessageResult;

/**
 * Drop the compose window's autosaved draft once its mail is sent.
 *
 * The send has already succeeded, so a refusal here is logged and swallowed:
 * failing the request would tell the user a sent mail was not sent. The cost is
 * a stale copy left in Gmail's drafts, which they can delete by hand.
 */
const discardSentDraftEffect = (
  gmail: GmailDataAdapter,
  account: string,
  draftId: string | undefined,
): Effect.Effect<void> =>
  draftId
    ? tryAsync(() => gmail.deleteDraft({ account, draftId })).pipe(
        Effect.catch((err) =>
          Effect.sync(() =>
            debug.warn("sent draft not deleted", { draftId, message: err.message }),
          ),
        ),
      )
    : Effect.void;

/** What every send may carry beside its addresses and text. */
export interface SendExtras {
  /** A send-as alias of the sending account; absent is the account's own address. */
  from?: string;
  /** Files uploaded through `/compose/uploads`, by id, in chip order. */
  uploadIds?: string[];
  /** The compose window's autosaved draft, deleted once the mail is sent. */
  draftId?: string;
  /**
   * A Message-ID of miel's own. A scheduled send writes one so that a retry
   * after a crash can ask Gmail whether the first attempt went out.
   */
  messageId?: string;
  gmail?: GmailDataAdapter;
}

const storedAsQuoted = (msg: StoredMessage): QuotedOriginal => ({
  ...msg,
  ccEmails: ccFromHeaders(msg.rawHeaders),
});

export interface SendReplyArgs extends AccountArgs, SendExtras {
  gmailMessageId: string;
  subject: string;
  body: string;
  /** Edited in the compose window (#96); omitted, the stored message decides. */
  to?: string[];
  cc?: string[];
  bcc?: string[];
  /** With no Cc named, copy the original's other participants. */
  replyAll?: boolean;
  /**
   * Send from another connected mailbox than the one the message arrived in.
   * The reply then cannot join the conversation's Gmail thread (that thread
   * belongs to the other mailbox), so it is sent with the RFC threading headers
   * only — every client still groups it.
   */
  fromAccountId?: string;
  /** Quote the message being answered under the reply. Default true: the design sends it either way. */
  includeQuote?: boolean;
  /** The quote's text as the user trimmed it, instead of the stored original's. */
  quotedText?: string;
}

export const sendReplyEffect = (
  args: SendReplyArgs,
): Effect.Effect<SendMessageResult, Error, Stores> =>
  Effect.gen(function* () {
    debug("sendReply", {
      gmailMessageId: args.gmailMessageId,
      subject: args.subject,
      bodyLen: args.body.length,
      replyAll: Boolean(args.replyAll),
      uploads: args.uploadIds?.length ?? 0,
    });
    const gmail = args.gmail ?? createGmailAdapter();
    const msg = yield* resolveMessageEffect(args);
    const sender =
      args.fromAccountId && args.fromAccountId !== msg.accountId
        ? yield* resolveAccountEffect({ accountId: args.fromAccountId })
        : null;
    const sendingEmail = sender?.email ?? msg.accountEmail;
    const sendingId = sender?.id ?? msg.accountId;

    const { to, cc, bcc } = resolveReplyRecipients(
      { ...msg, ccEmails: ccFromHeaders(msg.rawHeaders) },
      { to: args.to, cc: args.cc, bcc: args.bcc, replyAll: args.replyAll },
      msg.accountEmail,
    );
    const from = yield* resolveFromEffect({ gmail, accountEmail: sendingEmail, from: args.from });
    const attachments = yield* loadUploadsEffect({
      accountId: sendingId,
      uploadIds: args.uploadIds,
    });
    yield* checkAttachmentSizeEffect(attachments);
    const bodies =
      args.includeQuote === false
        ? { text: args.body }
        : withBlock(args.body, replyQuote(storedAsQuoted(msg), args.quotedText));

    const message = {
      account: sendingEmail,
      to,
      cc,
      bcc,
      subject: args.subject,
      body: bodies.text,
      ...("html" in bodies ? { html: bodies.html } : {}),
      ...(from ? { from } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(args.messageId ? { messageId: args.messageId } : {}),
    };
    const { messageId, threadId } = sender
      ? yield* Effect.gen(function* () {
          const original = yield* tryAsync(() =>
            gmail.threadingOf({ account: msg.accountEmail, messageId: msg.gmailMessageId }),
          );
          return yield* tryAsync(() =>
            gmail.sendThreaded({ ...message, threading: { inReplyTo: original.inReplyTo } }),
          );
        })
      : yield* tryAsync(() =>
          gmail.sendReply({ ...message, replyToMessageId: msg.gmailMessageId }),
        );
    yield* discardSentDraftEffect(gmail, sendingEmail, args.draftId);
    yield* recordRecipientsEffect({
      accountId: sendingId,
      accountEmail: sendingEmail,
      addresses: [...to, ...(cc ?? []), ...(bcc ?? [])],
      at: new Date(),
    });
    debug("sendReply done", { gmailMessageId: args.gmailMessageId, sentMessageId: messageId });
    return { ok: true, sentMessageId: messageId, threadId };
  });

export interface ForwardMessageArgs extends AccountArgs, SendExtras {
  gmailMessageId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** What the user wrote above the forwarded message; may be empty. */
  body: string;
  /**
   * The original's attachments to carry, by Gmail attachment id. Absent keeps
   * them all; a chip the user removed is simply not named.
   */
  keepAttachmentIds?: string[];
}

/**
 * Forwarding a stored message: the user's text, then the "Forwarded
 * message" block with the original's header and body (text and HTML), then the
 * original's kept attachments fetched from Gmail plus anything newly uploaded.
 *
 * It stays in the original's conversation in this mailbox, as Gmail's own
 * forward does; the recipients see a new message.
 */
export const forwardMessageEffect = (
  args: ForwardMessageArgs,
): Effect.Effect<SendMessageResult, Error, Stores> =>
  Effect.gen(function* () {
    debug("forwardMessage", { gmailMessageId: args.gmailMessageId });
    const to = cleanList(args.to);
    if (to.length === 0) {
      return yield* new ComposeRefusedError({
        reason: "no_recipients",
        message: "A forward needs at least one To address.",
      });
    }
    const gmail = args.gmail ?? createGmailAdapter();
    const msg = yield* resolveMessageEffect(args);
    const from = yield* resolveFromEffect({
      gmail,
      accountEmail: msg.accountEmail,
      from: args.from,
    });
    const uploaded = yield* loadUploadsEffect({
      accountId: msg.accountId,
      uploadIds: args.uploadIds,
    });
    // Sized before the original's files are fetched where that is already
    // enough to refuse, then again once they are in.
    yield* checkAttachmentSizeEffect(uploaded);
    const forwarded = yield* loadForwardedAttachmentsEffect({
      gmail,
      source: msg,
      keep: args.keepAttachmentIds,
    });
    const attachments = [...forwarded, ...uploaded];
    yield* checkAttachmentSizeEffect(attachments);
    const cc = cleanList(args.cc);
    const bcc = cleanList(args.bcc);
    const bodies = withBlock(args.body, forwardBlock(storedAsQuoted(msg)));
    const original = yield* tryAsync(() =>
      gmail.threadingOf({ account: msg.accountEmail, messageId: msg.gmailMessageId }),
    );
    const { messageId, threadId } = yield* tryAsync(() =>
      gmail.sendThreaded({
        account: msg.accountEmail,
        to,
        ...(cc.length > 0 ? { cc } : {}),
        ...(bcc.length > 0 ? { bcc } : {}),
        subject: args.subject,
        body: bodies.text,
        html: bodies.html,
        ...(from ? { from } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
        ...(args.messageId ? { messageId: args.messageId } : {}),
        threading: original,
      }),
    );
    yield* discardSentDraftEffect(gmail, msg.accountEmail, args.draftId);
    yield* recordRecipientsEffect({
      accountId: msg.accountId,
      accountEmail: msg.accountEmail,
      addresses: [...to, ...cc, ...bcc],
      at: new Date(),
    });
    debug("forwardMessage done", { sentMessageId: messageId, attachments: attachments.length });
    return { ok: true, sentMessageId: messageId, threadId };
  });

export interface SendNewMessageArgs extends AccountArgs, SendExtras {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}

/**
 * Sending a message that answers nothing: no thread and no threading headers,
 * so Gmail starts a conversation for it. Unlike a reply there is no stored
 * message to fall back on, so a To that cleans away to nothing is refused here
 * rather than sent to nobody.
 */
export const sendNewMessageEffect = (
  args: SendNewMessageArgs,
): Effect.Effect<SendMessageResult, Error, Stores> =>
  Effect.gen(function* () {
    debug("sendNewMessage", { subject: args.subject, bodyLen: args.body.length });
    const to = cleanList(args.to);
    if (to.length === 0) {
      return yield* new ComposeRefusedError({
        reason: "no_recipients",
        message: "A new message needs at least one To address.",
      });
    }
    const gmail = args.gmail ?? createGmailAdapter();
    const account = yield* resolveAccountEffect(args);
    const from = yield* resolveFromEffect({ gmail, accountEmail: account.email, from: args.from });
    const attachments = yield* loadUploadsEffect({
      accountId: account.id,
      uploadIds: args.uploadIds,
    });
    yield* checkAttachmentSizeEffect(attachments);
    const cc = cleanList(args.cc);
    const bcc = cleanList(args.bcc);
    const { messageId, threadId } = yield* tryAsync(() =>
      gmail.sendNew({
        account: account.email,
        to,
        ...(cc.length > 0 ? { cc } : {}),
        ...(bcc.length > 0 ? { bcc } : {}),
        subject: args.subject,
        body: args.body,
        ...(from ? { from } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
        ...(args.messageId ? { messageId: args.messageId } : {}),
      }),
    );
    yield* discardSentDraftEffect(gmail, account.email, args.draftId);
    yield* recordRecipientsEffect({
      accountId: account.id,
      accountEmail: account.email,
      addresses: [...to, ...cc, ...bcc],
      at: new Date(),
    });
    debug("sendNewMessage done", { sentMessageId: messageId, threadId });
    return { ok: true, sentMessageId: messageId, threadId };
  });

/** The quote a reply carries and the block a forward carries, for the compose window to show. */
export interface QuotePreview {
  reply: QuoteBlock;
  forward: QuoteBlock;
  /** What a forward carries by default — every attachment of the original. */
  attachments: { attachmentId: string; filename: string; mimeType: string; size: number }[];
}

/**
 * What the server will put under a reply or a forward of this message, so the
 * compose window can draw the collapsed quote (and let it be trimmed) and the
 * forward's attachment chips without assembling either itself.
 */
export const quotePreviewEffect = (
  args: AccountArgs & { gmailMessageId: string },
): Effect.Effect<QuotePreview, ComposeRefusedError, MessageStore> =>
  Effect.gen(function* () {
    const msg = yield* resolveMessageEffect(args);
    const attachments = yield* MessageStore.use((svc) =>
      svc.attachmentsFor([{ accountId: msg.accountId, gmailMessageId: msg.gmailMessageId }]),
    );
    const original = storedAsQuoted(msg);
    return {
      reply: replyQuote(original),
      forward: forwardBlock(original),
      attachments: attachments.map((a) => ({
        attachmentId: a.attachmentId,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
      })),
    };
  });

// Promise facades for the API/CLI boundary.
//
// The two generations take an optional cancellation: a request id the client
// can name in `POST /compose/generations/:requestId/cancel`, and the HTTP
// request's own abort signal. Either interrupts the run, which kills the CLI
// subprocess or aborts the vendor request.

export async function generateReply(
  args: GenerateReplyArgs,
  cancel?: Cancellation,
): Promise<GenerateReplyResult> {
  // The one seam, provided where the Promise boundary is (#133): the live
  // Claude needs the stores, so they go under it.
  return runCancellable(Effect.provide(generateReplyEffect(args), ClaudeLive), cancel);
}

export async function generateNewMessage(
  args: GenerateNewMessageArgs,
  cancel?: Cancellation,
): Promise<GenerateReplyResult> {
  return runCancellable(Effect.provide(generateNewMessageEffect(args), ClaudeLive), cancel);
}

export async function sendReply(args: SendReplyArgs): Promise<SendMessageResult> {
  return runWithStores(sendReplyEffect(args));
}

export async function forwardMessage(args: ForwardMessageArgs): Promise<SendMessageResult> {
  return runWithStores(forwardMessageEffect(args));
}

export async function sendNewMessage(args: SendNewMessageArgs): Promise<SendMessageResult> {
  return runWithStores(sendNewMessageEffect(args));
}

export async function quotePreview(
  args: AccountArgs & { gmailMessageId: string },
): Promise<QuotePreview> {
  return runWithStores(quotePreviewEffect(args));
}

export type { ReplyGenOutputT };
