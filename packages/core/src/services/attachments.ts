import { Effect } from "effect";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { accounts, messageAttachments } from "../db/schema";
import { createGmailAdapter, type GmailDataAdapter } from "../google/gmailAdapter";
import { runPromiseRethrow, tryAsync } from "../util/effect";

export interface DownloadAttachmentArgs {
  accountId: string;
  gmailMessageId: string;
  attachmentId: string;
  gmail?: GmailDataAdapter;
}

export interface DownloadedAttachment {
  data: Uint8Array;
  filename: string;
  mimeType: string;
  size: number;
}

export class AttachmentNotFoundError extends Error {
  readonly _tag = "AttachmentNotFoundError";
  constructor(public readonly attachmentId: string) {
    super(`Attachment not found: ${attachmentId}`);
  }
}

export const downloadAttachmentEffect = (
  args: DownloadAttachmentArgs,
): Effect.Effect<DownloadedAttachment, Error> =>
  Effect.gen(function* () {
    const { db } = getDb();
    const rows = yield* Effect.promise(() =>
      db
        .select({
          accountEmail: accounts.email,
          filename: messageAttachments.filename,
          mimeType: messageAttachments.mimeType,
          size: messageAttachments.size,
        })
        .from(messageAttachments)
        .innerJoin(accounts, eq(messageAttachments.accountId, accounts.id))
        .where(
          and(
            eq(messageAttachments.accountId, args.accountId),
            eq(messageAttachments.gmailMessageId, args.gmailMessageId),
            eq(messageAttachments.attachmentId, args.attachmentId),
          ),
        )
        .limit(1),
    );
    if (rows.length === 0) {
      return yield* Effect.fail(new AttachmentNotFoundError(args.attachmentId));
    }
    const meta = rows[0];
    const gmail = args.gmail ?? createGmailAdapter();
    const fetched = yield* tryAsync(() =>
      gmail.getAttachment({
        account: meta.accountEmail,
        messageId: args.gmailMessageId,
        attachmentId: args.attachmentId,
      }),
    );
    return {
      data: fetched.data,
      filename: meta.filename,
      mimeType: meta.mimeType,
      size: fetched.size || meta.size,
    };
  });

export async function downloadAttachment(
  args: DownloadAttachmentArgs,
): Promise<DownloadedAttachment> {
  return runPromiseRethrow(downloadAttachmentEffect(args));
}
