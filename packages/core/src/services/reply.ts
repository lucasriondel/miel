import { Effect } from "effect";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { accounts, messages } from "../db/schema";
import { createGmailAdapter, type GmailDataAdapter } from "../google/gmailAdapter";
import { Claude, ClaudeLive } from "../claude/Claude";
import { type ReplyGenOutputT } from "../schemas/reply";
import { createDebug } from "../util/debug";
import { runPromiseRethrow, tryAsync } from "../util/effect";
import { resolveReplyRecipients } from "./replyRecipients";
import { runWithStores } from "../stores/postgres";
// Shared with the landing page's Claude disclosure, so the published figure and
// the one actually applied here cannot drift apart.
import { REPLY_BODY_TRUNCATION as BODY_TRUNCATION } from "../claudeUsage";

const debug = createDebug("service:reply");

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

interface ResolvedMessage {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string;
  toEmails: string[];
  subject: string | null;
  bodyText: string;
}

const resolveMessageEffect = (args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
}): Effect.Effect<ResolvedMessage, Error> =>
  Effect.gen(function* () {
    const { db } = getDb();
    const condition = args.accountId
      ? eq(accounts.id, args.accountId)
      : args.accountEmail
        ? eq(accounts.email, args.accountEmail)
        : null;
    if (!condition) {
      return yield* Effect.fail(new Error("accountEmail or accountId is required"));
    }
    const rows = yield* Effect.promise(() =>
      db
        .select({
          accountId: accounts.id,
          accountEmail: accounts.email,
          gmailMessageId: messages.gmailMessageId,
          gmailThreadId: messages.gmailThreadId,
          fromEmail: messages.fromEmail,
          toEmails: messages.toEmails,
          subject: messages.subject,
          bodyText: messages.bodyText,
        })
        .from(messages)
        .innerJoin(accounts, eq(messages.accountId, accounts.id))
        .where(and(condition, eq(messages.gmailMessageId, args.gmailMessageId)))
        .limit(1),
    );
    if (rows.length === 0) {
      return yield* Effect.fail(new Error(`Message not found: ${args.gmailMessageId}`));
    }
    return {
      accountId: rows[0].accountId,
      accountEmail: rows[0].accountEmail,
      gmailMessageId: rows[0].gmailMessageId,
      gmailThreadId: rows[0].gmailThreadId,
      fromEmail: rows[0].fromEmail,
      toEmails: rows[0].toEmails,
      subject: rows[0].subject,
      bodyText: rows[0].bodyText ?? "",
    };
  });

export interface GenerateReplyArgs {
  accountId?: string;
  accountEmail?: string;
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
): Effect.Effect<GenerateReplyResult, Error, Claude> =>
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
      body: truncate(msg.bodyText, BODY_TRUNCATION),
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

export interface SendReplyArgs {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  subject: string;
  body: string;
  /** Edited in the compose window (#96); omitted, the stored message decides. */
  to?: string[];
  cc?: string[];
  gmail?: GmailDataAdapter;
}

export interface SendReplyResult {
  ok: true;
  sentMessageId: string;
}

export const sendReplyEffect = (args: SendReplyArgs): Effect.Effect<SendReplyResult, Error> =>
  Effect.gen(function* () {
    debug("sendReply", {
      gmailMessageId: args.gmailMessageId,
      subject: args.subject,
      bodyLen: args.body.length,
    });
    const gmail = args.gmail ?? createGmailAdapter();
    const msg = yield* resolveMessageEffect(args);
    const { to, cc } = resolveReplyRecipients(msg, { to: args.to, cc: args.cc });
    const { messageId } = yield* tryAsync(() =>
      gmail.sendReply({
        account: msg.accountEmail,
        to,
        cc,
        subject: args.subject,
        body: args.body,
        replyToMessageId: msg.gmailMessageId,
      }),
    );
    debug("sendReply done", {
      gmailMessageId: args.gmailMessageId,
      sentMessageId: messageId,
    });
    return { ok: true, sentMessageId: messageId };
  });

// Promise facades for the API/CLI boundary.
export async function generateReply(args: GenerateReplyArgs): Promise<GenerateReplyResult> {
  // The one seam, provided where the Promise boundary is (#133): the live
  // Claude needs the stores, so they go under it.
  return runWithStores(Effect.provide(generateReplyEffect(args), ClaudeLive));
}

export async function sendReply(args: SendReplyArgs): Promise<SendReplyResult> {
  return runPromiseRethrow(sendReplyEffect(args));
}

export type { ReplyGenOutputT };
