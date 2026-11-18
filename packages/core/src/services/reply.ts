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
import { type ReplyGenOutputT } from "../schemas/reply";
import { MessageStore, type StoredAccount, type StoredMessage } from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { createDebug } from "../util/debug";
import { tryAsync } from "../util/effect";
import { ccFromHeaders, resolveReplyRecipients } from "./replyRecipients";
// Shared with the landing page's Claude disclosure, so the published figure and
// the one actually applied here cannot drift apart.
import { REPLY_BODY_TRUNCATION as BODY_TRUNCATION } from "../claudeUsage";

const debug = createDebug("service:reply");

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

/** Which account is writing, named either way round (the API by id, the CLI by email). */
interface AccountArgs {
  accountId?: string;
  accountEmail?: string;
}

const resolveAccountEffect = (
  args: AccountArgs,
): Effect.Effect<StoredAccount, Error, MessageStore> =>
  Effect.gen(function* () {
    const { accountId, accountEmail } = args;
    const account = accountId
      ? yield* MessageStore.use((svc) => svc.accountById(accountId))
      : accountEmail
        ? yield* MessageStore.use((svc) => svc.accountByEmail(accountEmail))
        : yield* Effect.fail(new Error("accountEmail or accountId is required"));
    if (!account) {
      return yield* Effect.fail(new Error(`Account not found: ${accountId ?? accountEmail}`));
    }
    return account;
  });

const resolveMessageEffect = (
  args: AccountArgs & { gmailMessageId: string },
): Effect.Effect<StoredMessage, Error, MessageStore> =>
  Effect.gen(function* () {
    const account = yield* resolveAccountEffect(args);
    const msg = yield* MessageStore.use((svc) =>
      svc.detail({ accountId: account.id, gmailMessageId: args.gmailMessageId }),
    );
    if (!msg) {
      return yield* Effect.fail(new Error(`Message not found: ${args.gmailMessageId}`));
    }
    return msg;
  });

/** Trimmed and blank-free; an address list the sender typed, cleaned. */
const cleanList = (list: readonly string[] | undefined): string[] =>
  (list ?? []).map((a) => a.trim()).filter((a) => a.length > 0);

export interface GenerateReplyArgs extends AccountArgs {
  gmailMessageId: string;
  prompt: string;
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
    });
    const claude = yield* Claude;
    const msg = yield* resolveMessageEffect(args);
    const { output, model, runId } = yield* claude.run("reply", {
      from: msg.fromEmail,
      to: msg.toEmails,
      subject: msg.subject,
      body: truncate(msg.bodyText ?? "", BODY_TRUNCATION),
      userInstruction: args.prompt,
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

export interface SendReplyArgs extends AccountArgs {
  gmailMessageId: string;
  subject: string;
  body: string;
  /** Edited in the compose window (#96); omitted, the stored message decides. */
  to?: string[];
  cc?: string[];
  bcc?: string[];
  /** With no Cc named, copy the original's other participants. */
  replyAll?: boolean;
  /** The compose window's autosaved draft, deleted once the reply is sent. */
  draftId?: string;
  gmail?: GmailDataAdapter;
}

export const sendReplyEffect = (
  args: SendReplyArgs,
): Effect.Effect<SendMessageResult, Error, MessageStore> =>
  Effect.gen(function* () {
    debug("sendReply", {
      gmailMessageId: args.gmailMessageId,
      subject: args.subject,
      bodyLen: args.body.length,
      replyAll: Boolean(args.replyAll),
    });
    const gmail = args.gmail ?? createGmailAdapter();
    const msg = yield* resolveMessageEffect(args);
    const { to, cc, bcc } = resolveReplyRecipients(
      { ...msg, ccEmails: ccFromHeaders(msg.rawHeaders) },
      { to: args.to, cc: args.cc, bcc: args.bcc, replyAll: args.replyAll },
      msg.accountEmail,
    );
    const { messageId, threadId } = yield* tryAsync(() =>
      gmail.sendReply({
        account: msg.accountEmail,
        to,
        cc,
        bcc,
        subject: args.subject,
        body: args.body,
        replyToMessageId: msg.gmailMessageId,
      }),
    );
    yield* discardSentDraftEffect(gmail, msg.accountEmail, args.draftId);
    debug("sendReply done", { gmailMessageId: args.gmailMessageId, sentMessageId: messageId });
    return { ok: true, sentMessageId: messageId, threadId };
  });

export interface SendNewMessageArgs extends AccountArgs {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  /** The compose window's autosaved draft, deleted once the mail is sent. */
  draftId?: string;
  gmail?: GmailDataAdapter;
}

/**
 * Sending a message that answers nothing: no thread and no threading headers,
 * so Gmail starts a conversation for it. Unlike a reply there is no stored
 * message to fall back on, so a To that cleans away to nothing is refused here
 * rather than sent to nobody.
 */
export const sendNewMessageEffect = (
  args: SendNewMessageArgs,
): Effect.Effect<SendMessageResult, Error, MessageStore> =>
  Effect.gen(function* () {
    debug("sendNewMessage", { subject: args.subject, bodyLen: args.body.length });
    const to = cleanList(args.to);
    if (to.length === 0) {
      return yield* Effect.fail(new Error("A new message needs at least one To address"));
    }
    const gmail = args.gmail ?? createGmailAdapter();
    const account = yield* resolveAccountEffect(args);
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
      }),
    );
    yield* discardSentDraftEffect(gmail, account.email, args.draftId);
    debug("sendNewMessage done", { sentMessageId: messageId, threadId });
    return { ok: true, sentMessageId: messageId, threadId };
  });

// Promise facades for the API/CLI boundary.
export async function generateReply(args: GenerateReplyArgs): Promise<GenerateReplyResult> {
  // The one seam, provided where the Promise boundary is (#133): the live
  // Claude needs the stores, so they go under it.
  return runWithStores(Effect.provide(generateReplyEffect(args), ClaudeLive));
}

export async function generateNewMessage(
  args: GenerateNewMessageArgs,
): Promise<GenerateReplyResult> {
  return runWithStores(Effect.provide(generateNewMessageEffect(args), ClaudeLive));
}

export async function sendReply(args: SendReplyArgs): Promise<SendMessageResult> {
  return runWithStores(sendReplyEffect(args));
}

export async function sendNewMessage(args: SendNewMessageArgs): Promise<SendMessageResult> {
  return runWithStores(sendNewMessageEffect(args));
}

export type { ReplyGenOutputT };
