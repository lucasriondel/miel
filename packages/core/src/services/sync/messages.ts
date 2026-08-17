import { Effect } from "effect";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { messageAttachments, messageLabels, messages } from "../../db/schema";
import type { NormalizedMessage } from "./types";

export const upsertMessages = (rows: NormalizedMessage[]): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (rows.length === 0) return;
    const { db } = getDb();
    yield* Effect.promise(() =>
      db
        .insert(messages)
        .values(
          rows.map((r) => ({
            accountId: r.accountId,
            gmailMessageId: r.gmailMessageId,
            gmailThreadId: r.gmailThreadId,
            fromEmail: r.fromEmail,
            fromName: r.fromName,
            toEmails: r.toEmails,
            subject: r.subject,
            snippet: r.snippet,
            bodyText: r.bodyText,
            bodyHtml: r.bodyHtml,
            internalDate: r.internalDate,
            rawHeaders: r.rawHeaders,
          })),
        )
        .onConflictDoUpdate({
          target: [messages.accountId, messages.gmailMessageId],
          set: {
            gmailThreadId: sql`excluded.gmail_thread_id`,
            fromEmail: sql`excluded.from_email`,
            fromName: sql`excluded.from_name`,
            toEmails: sql`excluded.to_emails`,
            subject: sql`excluded.subject`,
            snippet: sql`excluded.snippet`,
            bodyText: sql`excluded.body_text`,
            bodyHtml: sql`excluded.body_html`,
            internalDate: sql`excluded.internal_date`,
            rawHeaders: sql`excluded.raw_headers`,
          },
        }),
    );

    const attachmentRows = rows.flatMap((r) =>
      r.attachments.map((a) => ({
        accountId: r.accountId,
        gmailMessageId: r.gmailMessageId,
        attachmentId: a.attachmentId,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
      })),
    );
    if (attachmentRows.length > 0) {
      yield* Effect.promise(() =>
        db
          .insert(messageAttachments)
          .values(attachmentRows)
          .onConflictDoUpdate({
            target: [
              messageAttachments.accountId,
              messageAttachments.gmailMessageId,
              messageAttachments.attachmentId,
            ],
            set: {
              filename: sql`excluded.filename`,
              mimeType: sql`excluded.mime_type`,
              size: sql`excluded.size`,
            },
          }),
      );
    }
  });

export const upsertMessageLabels = (args: {
  accountId: string;
  rows: { gmailMessageId: string; labelIds: string[] }[];
  labelMap: Map<string, string>;
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    const inserts: {
      accountId: string;
      gmailMessageId: string;
      labelId: string;
    }[] = [];
    for (const row of args.rows) {
      for (const gmailLabelId of row.labelIds) {
        const labelId = args.labelMap.get(gmailLabelId);
        if (!labelId) continue;
        inserts.push({
          accountId: args.accountId,
          gmailMessageId: row.gmailMessageId,
          labelId,
        });
      }
    }
    if (inserts.length === 0) return;
    const { db } = getDb();
    yield* Effect.promise(() => db.insert(messageLabels).values(inserts).onConflictDoNothing());
  });

export const deduplicateHits = (args: {
  accountId: string;
  hitIds: string[];
}): Effect.Effect<Set<string>> =>
  Effect.gen(function* () {
    if (args.hitIds.length === 0) return new Set();
    const { db } = getDb();
    const existing = yield* Effect.promise(() =>
      db
        .select({ gmailMessageId: messages.gmailMessageId })
        .from(messages)
        .where(
          and(
            eq(messages.accountId, args.accountId),
            inArray(messages.gmailMessageId, args.hitIds),
          ),
        ),
    );
    return new Set(existing.map((r) => r.gmailMessageId));
  });
