import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { accounts, messages } from "../db/schema";
import { createGogAdapter, type GogAdapter } from "../adapters/gog";
import {
  createClaudeAdapter,
  type ClaudeAdapter,
} from "../adapters/claude";
import { type ReplyGenOutputT } from "../schemas/reply";
import { createDebug } from "../util/debug";

const debug = createDebug("service:reply");

const BODY_TRUNCATION = 8000;

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

async function resolveMessage(args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
}): Promise<ResolvedMessage> {
  const { db } = getDb();
  const condition = args.accountId
    ? eq(accounts.id, args.accountId)
    : args.accountEmail
      ? eq(accounts.email, args.accountEmail)
      : null;
  if (!condition) {
    throw new Error("accountEmail or accountId is required");
  }
  const rows = await db
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
    .limit(1);
  if (rows.length === 0) {
    throw new Error(`Message not found: ${args.gmailMessageId}`);
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
}

export interface GenerateReplyArgs {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  prompt: string;
  claude?: ClaudeAdapter;
}

export interface GenerateReplyResult {
  subject: string;
  body: string;
  model: string;
  runId: string;
}

export async function generateReply(
  args: GenerateReplyArgs,
): Promise<GenerateReplyResult> {
  debug("generateReply", {
    gmailMessageId: args.gmailMessageId,
    accountEmail: args.accountEmail,
    promptLen: args.prompt.length,
  });
  const claude = args.claude ?? createClaudeAdapter();
  const msg = await resolveMessage(args);
  const { output, model, runId } = await claude.generateReply({
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
}

export interface SendReplyArgs {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  subject: string;
  body: string;
  gog?: GogAdapter;
}

export interface SendReplyResult {
  ok: true;
  sentMessageId: string;
}

export async function sendReply(args: SendReplyArgs): Promise<SendReplyResult> {
  debug("sendReply", {
    gmailMessageId: args.gmailMessageId,
    subject: args.subject,
    bodyLen: args.body.length,
  });
  const gog = args.gog ?? createGogAdapter();
  const msg = await resolveMessage(args);
  const recipients = msg.toEmails.length > 0 ? msg.toEmails : [msg.fromEmail];
  const replyTo =
    msg.fromEmail && !recipients.includes(msg.fromEmail)
      ? [msg.fromEmail]
      : recipients;
  const { messageId } = await gog.sendReply({
    account: msg.accountEmail,
    to: replyTo,
    subject: args.subject,
    body: args.body,
    replyToMessageId: msg.gmailMessageId,
  });
  debug("sendReply done", {
    gmailMessageId: args.gmailMessageId,
    sentMessageId: messageId,
  });
  return { ok: true, sentMessageId: messageId };
}

export type { ReplyGenOutputT };
