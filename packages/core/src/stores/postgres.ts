/**
 * The Postgres adapters behind the store contracts (#132, #136) — the
 * production half of the seam.
 *
 * These are the queries the settings, secrets, messages, apply and labels
 * services used to build inline, moved verbatim and now living in one place per
 * aggregate. Nothing else here: no defaulting, no validation, no encryption, no
 * cursor encoding. A store answers rows, and the rules about what a missing row
 * means or which of them still count as pending belong to the service that owns
 * them.
 *
 * `Effect.promise` keeps a failed query a defect, as it was before the move: an
 * unreachable database is an outage rather than a typed failure a caller is
 * expected to branch on.
 */
import { Effect, Layer } from "effect";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "../db/client";
import {
  accounts,
  appSettings,
  composeUploads,
  contacts,
  encryptedSecrets,
  labels,
  messageAttachments,
  messageLabels,
  messages,
  promoCodes,
  scheduledSends,
  snoozes,
  triages,
} from "../db/schema";
import { runPromiseRethrow } from "../util/effect";
import {
  ContactStore,
  LabelStore,
  MessageStore,
  OutboxStore,
  PromoStore,
  SecretStore,
  SettingsStore,
  TriageStore,
  type ContactStoreImpl,
  type LabelStoreImpl,
  type MessageRef,
  type OutboxStoreImpl,
  type MessageStoreImpl,
  type PromoStoreImpl,
  type SecretStoreImpl,
  type SettingsStoreImpl,
  type Stores,
  type TriageStoreImpl,
} from "./contracts";

const settingsImpl: SettingsStoreImpl = {
  read: (key) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db
          .select({ value: appSettings.value })
          .from(appSettings)
          .where(eq(appSettings.key, key))
          .limit(1),
      );
      return rows.length > 0 ? rows[0].value : null;
    }),

  write: (key, value) =>
    Effect.gen(function* () {
      const { db } = getDb();
      yield* Effect.promise(() =>
        db
          .insert(appSettings)
          .values({ key, value })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: { value, updatedAt: new Date() },
          }),
      );
    }),
};

const secretsImpl: SecretStoreImpl = {
  read: (name) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db
          .select({ encryptedValue: encryptedSecrets.encryptedValue })
          .from(encryptedSecrets)
          .where(eq(encryptedSecrets.name, name))
          .limit(1),
      );
      return rows.length > 0 ? rows[0].encryptedValue : null;
    }),

  write: (name, ciphertext) =>
    Effect.gen(function* () {
      const { db } = getDb();
      yield* Effect.promise(() =>
        db
          .insert(encryptedSecrets)
          .values({ name, encryptedValue: ciphertext })
          .onConflictDoUpdate({
            target: encryptedSecrets.name,
            set: { encryptedValue: ciphertext, updatedAt: new Date() },
          }),
      );
    }),

  remove: (name) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const removed = yield* Effect.promise(() =>
        db
          .delete(encryptedSecrets)
          .where(eq(encryptedSecrets.name, name))
          .returning({ name: encryptedSecrets.name }),
      );
      return removed.length;
    }),
};

/**
 * `(account_id, gmail_message_id) IN ((…), …)` — the composite-key filter both
 * per-message reads use. Callers check for an empty list first; an empty `IN ()`
 * is a syntax error.
 */
const messageRefsIn = (
  accountIdCol: AnyPgColumn,
  messageIdCol: AnyPgColumn,
  refs: readonly MessageRef[],
) =>
  sql`(${accountIdCol}, ${messageIdCol}) IN (${sql.join(
    refs.map((r) => sql`(${r.accountId}::uuid, ${r.gmailMessageId})`),
    sql`, `,
  )})`;

const ACCOUNT_COLUMNS = {
  id: accounts.id,
  email: accounts.email,
  displayName: accounts.displayName,
  nickname: accounts.nickname,
  avatarUrl: accounts.avatarUrl,
  createdAt: accounts.createdAt,
  lastSyncedAt: accounts.lastSyncedAt,
};

const LABEL_COLUMNS = {
  id: labels.id,
  accountId: labels.accountId,
  gmailLabelId: labels.gmailLabelId,
  name: labels.name,
  type: labels.type,
  colorBg: labels.colorBg,
  colorFg: labels.colorFg,
};

/** A message's conversation's snooze, if it has one — joined by thread. */
const snoozedThread = snoozes;
const snoozedThreadJoin = and(
  eq(snoozes.accountId, messages.accountId),
  eq(snoozes.gmailThreadId, messages.gmailThreadId),
);

const messagesImpl: MessageStoreImpl = {
  list: (filter) =>
    Effect.gen(function* () {
      const { db } = getDb();

      const latestTriagePerMsg = db.$with("latest_triage").as(
        db
          .selectDistinctOn([triages.accountId, triages.gmailMessageId], {
            accountId: triages.accountId,
            gmailMessageId: triages.gmailMessageId,
            triageId: triages.id,
            priority: triages.priority,
          })
          .from(triages)
          .orderBy(triages.accountId, triages.gmailMessageId, desc(triages.createdAt)),
      );

      const conditions: SQL[] = [];
      if (filter.accountId) {
        conditions.push(eq(messages.accountId, filter.accountId));
      }
      if (filter.snoozedOnly) {
        conditions.push(isNotNull(snoozes.wakeAt));
      } else if (filter.archivedOnly) {
        // Done is archived and not snoozed: a snoozed thread is archived in
        // Gmail too, and it belongs to the Snoozed view.
        conditions.push(eq(messages.isArchived, true));
        conditions.push(isNull(snoozes.wakeAt));
      } else if (!filter.includeArchived) {
        conditions.push(eq(messages.isArchived, false));
      }
      if (!filter.includeTrashed) {
        conditions.push(eq(messages.isTrashed, false));
      }
      if (!filter.includeRemoved) {
        conditions.push(isNull(messages.removedAt));
      }
      if (filter.olderThan) {
        conditions.push(
          sql`(${messages.internalDate}, ${messages.gmailMessageId}) < (${filter.olderThan.internalDate.toISOString()}::timestamptz, ${filter.olderThan.gmailMessageId})`,
        );
      }
      if (filter.priority) {
        conditions.push(eq(latestTriagePerMsg.priority, filter.priority));
      }
      if (filter.internalDateFrom) {
        conditions.push(gte(messages.internalDate, filter.internalDateFrom));
      }
      if (filter.internalDateTo) {
        conditions.push(lt(messages.internalDate, filter.internalDateTo));
      }

      let query = db
        .with(latestTriagePerMsg)
        .select({
          accountId: messages.accountId,
          accountEmail: accounts.email,
          gmailMessageId: messages.gmailMessageId,
          gmailThreadId: messages.gmailThreadId,
          fromEmail: messages.fromEmail,
          fromName: messages.fromName,
          toEmails: messages.toEmails,
          subject: messages.subject,
          snippet: messages.snippet,
          internalDate: messages.internalDate,
          isArchived: messages.isArchived,
          isTrashed: messages.isTrashed,
          priority: latestTriagePerMsg.priority,
          triageId: latestTriagePerMsg.triageId,
          snoozedUntil: snoozes.wakeAt,
        })
        .from(messages)
        .innerJoin(accounts, eq(messages.accountId, accounts.id))
        .leftJoin(
          latestTriagePerMsg,
          and(
            eq(latestTriagePerMsg.accountId, messages.accountId),
            eq(latestTriagePerMsg.gmailMessageId, messages.gmailMessageId),
          ),
        )
        .leftJoin(snoozedThread, snoozedThreadJoin)
        .$dynamic();

      if (filter.labelId) {
        query = query.innerJoin(
          messageLabels,
          and(
            eq(messageLabels.accountId, messages.accountId),
            eq(messageLabels.gmailMessageId, messages.gmailMessageId),
            eq(messageLabels.labelId, filter.labelId),
          ),
        );
      }

      return yield* Effect.promise(() =>
        query
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(messages.internalDate), desc(messages.gmailMessageId))
          .limit(filter.limit),
      );
    }),

  detail: (ref) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db
          .select({
            accountId: messages.accountId,
            accountEmail: accounts.email,
            gmailMessageId: messages.gmailMessageId,
            gmailThreadId: messages.gmailThreadId,
            fromEmail: messages.fromEmail,
            fromName: messages.fromName,
            toEmails: messages.toEmails,
            subject: messages.subject,
            snippet: messages.snippet,
            bodyText: messages.bodyText,
            bodyHtml: messages.bodyHtml,
            internalDate: messages.internalDate,
            isArchived: messages.isArchived,
            isTrashed: messages.isTrashed,
            rawHeaders: messages.rawHeaders,
            snoozedUntil: snoozes.wakeAt,
          })
          .from(messages)
          .innerJoin(accounts, eq(messages.accountId, accounts.id))
          .leftJoin(snoozedThread, snoozedThreadJoin)
          .where(
            and(
              eq(messages.accountId, ref.accountId),
              eq(messages.gmailMessageId, ref.gmailMessageId),
            ),
          )
          .limit(1),
      );
      return rows.length > 0 ? rows[0] : null;
    }),

  threadIdOf: (ref) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db
          .select({ gmailThreadId: messages.gmailThreadId })
          .from(messages)
          .where(
            and(
              eq(messages.accountId, ref.accountId),
              eq(messages.gmailMessageId, ref.gmailMessageId),
            ),
          )
          .limit(1),
      );
      return rows.length > 0 ? rows[0].gmailThreadId : null;
    }),

  labelsFor: (refs) =>
    Effect.gen(function* () {
      if (refs.length === 0) return [];
      const { db } = getDb();
      return yield* Effect.promise(() =>
        db
          .select({
            accountId: messageLabels.accountId,
            gmailMessageId: messageLabels.gmailMessageId,
            labelId: labels.id,
            name: labels.name,
            gmailLabelId: labels.gmailLabelId,
            colorBg: labels.colorBg,
            colorFg: labels.colorFg,
          })
          .from(messageLabels)
          .innerJoin(labels, eq(messageLabels.labelId, labels.id))
          .where(messageRefsIn(messageLabels.accountId, messageLabels.gmailMessageId, refs)),
      );
    }),

  attachmentsFor: (refs) =>
    Effect.gen(function* () {
      if (refs.length === 0) return [];
      const { db } = getDb();
      return yield* Effect.promise(() =>
        db
          .select({
            accountId: messageAttachments.accountId,
            gmailMessageId: messageAttachments.gmailMessageId,
            attachmentId: messageAttachments.attachmentId,
            filename: messageAttachments.filename,
            mimeType: messageAttachments.mimeType,
            size: messageAttachments.size,
          })
          .from(messageAttachments)
          .where(
            messageRefsIn(messageAttachments.accountId, messageAttachments.gmailMessageId, refs),
          ),
      );
    }),

  attachLabels: ({ accountId, gmailMessageIds, labelIds }) =>
    Effect.gen(function* () {
      if (gmailMessageIds.length === 0 || labelIds.length === 0) return;
      const { db } = getDb();
      const values = gmailMessageIds.flatMap((gmailMessageId) =>
        labelIds.map((labelId) => ({ accountId, gmailMessageId, labelId })),
      );
      yield* Effect.promise(() => db.insert(messageLabels).values(values).onConflictDoNothing());
    }),

  detachLabels: ({ accountId, gmailMessageIds, labelIds }) =>
    Effect.gen(function* () {
      if (gmailMessageIds.length === 0 || labelIds.length === 0) return;
      const { db } = getDb();
      yield* Effect.promise(() =>
        db
          .delete(messageLabels)
          .where(
            and(
              eq(messageLabels.accountId, accountId),
              inArray(messageLabels.gmailMessageId, [...gmailMessageIds]),
              inArray(messageLabels.labelId, [...labelIds]),
            ),
          ),
      );
    }),

  setFlagsForMessages: ({ accountId, gmailMessageIds, flags }) =>
    Effect.gen(function* () {
      if (gmailMessageIds.length === 0) return;
      const { db } = getDb();
      yield* Effect.promise(() =>
        db
          .update(messages)
          .set(flags)
          .where(
            and(
              eq(messages.accountId, accountId),
              inArray(messages.gmailMessageId, [...gmailMessageIds]),
            ),
          ),
      );
    }),

  setFlagsForThread: ({ accountId, gmailThreadId, flags }) =>
    Effect.gen(function* () {
      const { db } = getDb();
      yield* Effect.promise(() =>
        db
          .update(messages)
          .set(flags)
          .where(and(eq(messages.accountId, accountId), eq(messages.gmailThreadId, gmailThreadId))),
      );
    }),

  accounts: () =>
    Effect.promise(() => {
      const { db } = getDb();
      return db.select(ACCOUNT_COLUMNS).from(accounts).orderBy(accounts.email);
    }),

  accountById: (id) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db.select(ACCOUNT_COLUMNS).from(accounts).where(eq(accounts.id, id)).limit(1),
      );
      return rows.length > 0 ? rows[0] : null;
    }),

  accountByEmail: (email) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db.select(ACCOUNT_COLUMNS).from(accounts).where(eq(accounts.email, email)).limit(1),
      );
      return rows.length > 0 ? rows[0] : null;
    }),

  setNickname: ({ id, nickname }) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db.update(accounts).set({ nickname }).where(eq(accounts.id, id)).returning({
          id: accounts.id,
        }),
      );
      return rows.length;
    }),

  snooze: (row) =>
    Effect.gen(function* () {
      const { db } = getDb();
      yield* Effect.promise(() =>
        db
          .insert(snoozes)
          .values(row)
          .onConflictDoUpdate({
            target: [snoozes.accountId, snoozes.gmailThreadId],
            set: { gmailMessageId: row.gmailMessageId, wakeAt: row.wakeAt, snoozedAt: new Date() },
          }),
      );
    }),

  unsnooze: ({ accountId, gmailThreadId }) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db
          .delete(snoozes)
          .where(and(eq(snoozes.accountId, accountId), eq(snoozes.gmailThreadId, gmailThreadId)))
          .returning({ accountId: snoozes.accountId }),
      );
      return rows.length;
    }),

  dueSnoozes: ({ now, limit }) =>
    Effect.promise(() => {
      const { db } = getDb();
      return db
        .select({
          accountId: snoozes.accountId,
          accountEmail: accounts.email,
          gmailThreadId: snoozes.gmailThreadId,
          gmailMessageId: snoozes.gmailMessageId,
          wakeAt: snoozes.wakeAt,
        })
        .from(snoozes)
        .innerJoin(accounts, eq(accounts.id, snoozes.accountId))
        .where(lte(snoozes.wakeAt, now))
        .orderBy(asc(snoozes.wakeAt))
        .limit(limit);
    }),
};

const triagesImpl: TriageStoreImpl = {
  historyFor: (ref) =>
    Effect.promise(() => {
      const { db } = getDb();
      return db
        .select({
          id: triages.id,
          accountId: triages.accountId,
          gmailMessageId: triages.gmailMessageId,
          priority: triages.priority,
          reasoning: triages.reasoning,
          model: triages.model,
          createdAt: triages.createdAt,
        })
        .from(triages)
        .where(
          and(eq(triages.accountId, ref.accountId), eq(triages.gmailMessageId, ref.gmailMessageId)),
        )
        .orderBy(desc(triages.createdAt));
    }),

  byId: (triageId) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db
          .select({
            id: triages.id,
            accountId: triages.accountId,
            gmailMessageId: triages.gmailMessageId,
            priority: triages.priority,
            reasoning: triages.reasoning,
            model: triages.model,
            createdAt: triages.createdAt,
          })
          .from(triages)
          .where(eq(triages.id, triageId))
          .limit(1),
      );
      return rows.length > 0 ? rows[0] : null;
    }),

  insert: (row) =>
    Effect.gen(function* () {
      const { db } = getDb();
      yield* Effect.promise(() =>
        db.insert(triages).values({
          accountId: row.accountId,
          gmailMessageId: row.gmailMessageId,
          priority: row.priority,
          reasoning: row.reasoning,
          model: row.model ?? null,
        }),
      );
    }),
};

const labelsImpl: LabelStoreImpl = {
  byAccount: (accountId) =>
    Effect.promise(() => {
      const { db } = getDb();
      return db.select(LABEL_COLUMNS).from(labels).where(eq(labels.accountId, accountId));
    }),

  byIds: ({ accountId, ids }) =>
    Effect.gen(function* () {
      if (ids.length === 0) return [];
      const { db } = getDb();
      return yield* Effect.promise(() =>
        db
          .select(LABEL_COLUMNS)
          .from(labels)
          .where(and(eq(labels.accountId, accountId), inArray(labels.id, [...ids]))),
      );
    }),

  byGmailIds: ({ accountId, gmailLabelIds }) =>
    Effect.gen(function* () {
      if (gmailLabelIds.length === 0) return [];
      const { db } = getDb();
      return yield* Effect.promise(() =>
        db
          .select(LABEL_COLUMNS)
          .from(labels)
          .where(
            and(eq(labels.accountId, accountId), inArray(labels.gmailLabelId, [...gmailLabelIds])),
          ),
      );
    }),

  byName: ({ accountId, name }) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db
          .select(LABEL_COLUMNS)
          .from(labels)
          .where(and(eq(labels.accountId, accountId), eq(labels.name, name)))
          .limit(1),
      );
      return rows.length > 0 ? rows[0] : null;
    }),

  upsert: (rows) =>
    Effect.gen(function* () {
      if (rows.length === 0) return [];
      const { db } = getDb();
      return yield* Effect.promise(() =>
        db
          .insert(labels)
          .values([...rows])
          .onConflictDoUpdate({
            target: [labels.accountId, labels.gmailLabelId],
            set: {
              name: sql`excluded.name`,
              type: sql`excluded.type`,
              colorBg: sql`excluded.color_bg`,
              colorFg: sql`excluded.color_fg`,
            },
          })
          .returning(LABEL_COLUMNS),
      );
    }),
};

const PROMO_COLUMNS = {
  id: promoCodes.id,
  accountId: promoCodes.accountId,
  gmailMessageId: promoCodes.gmailMessageId,
  code: promoCodes.code,
  discount: promoCodes.discount,
  terms: promoCodes.terms,
  expiresAt: promoCodes.expiresAt,
  merchant: promoCodes.merchant,
  savedAt: promoCodes.savedAt,
  createdAt: promoCodes.createdAt,
  subject: promoCodes.subject,
  fromName: promoCodes.fromName,
  fromEmail: promoCodes.fromEmail,
  internalDate: promoCodes.internalDate,
  bodyHtml: promoCodes.bodyHtml,
  bodyText: promoCodes.bodyText,
};

const promosImpl: PromoStoreImpl = {
  insert: (rows) =>
    Effect.gen(function* () {
      if (rows.length === 0) return [];
      const { db } = getDb();
      return yield* Effect.promise(() =>
        db
          .insert(promoCodes)
          .values([...rows])
          .returning(PROMO_COLUMNS),
      );
    }),

  byId: (id) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db.select(PROMO_COLUMNS).from(promoCodes).where(eq(promoCodes.id, id)).limit(1),
      );
      return rows.length > 0 ? rows[0] : null;
    }),

  // The join to `messages` is the read model, not an optimisation: the window is
  // the mail's date, and an unsaved detection is only suggested while its mail
  // is one the inbox is still showing. The join to `accounts` is the read model
  // too — the global read draws the mailbox as a column, so the row names it.
  //
  // An unnamed account is every account: the inbox section names one, the Promo
  // Codes page names none, and the same rules answer both.
  unsaved: (filter) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const conditions: SQL[] = [
        isNull(promoCodes.savedAt),
        eq(messages.isArchived, false),
        eq(messages.isTrashed, false),
        isNull(messages.removedAt),
      ];
      if (filter.accountId) {
        conditions.push(eq(promoCodes.accountId, filter.accountId));
      }
      if (filter.internalDateFrom) {
        conditions.push(gte(messages.internalDate, filter.internalDateFrom));
      }
      if (filter.internalDateTo) {
        conditions.push(lt(messages.internalDate, filter.internalDateTo));
      }
      return yield* Effect.promise(() =>
        db
          .select({
            ...PROMO_COLUMNS,
            accountEmail: accounts.email,
            mail: {
              subject: messages.subject,
              fromName: messages.fromName,
              fromEmail: messages.fromEmail,
              internalDate: messages.internalDate,
            },
          })
          .from(promoCodes)
          .innerJoin(
            messages,
            and(
              eq(messages.accountId, promoCodes.accountId),
              eq(messages.gmailMessageId, promoCodes.gmailMessageId),
            ),
          )
          .innerJoin(accounts, eq(accounts.id, promoCodes.accountId))
          .where(and(...conditions))
          .orderBy(desc(messages.internalDate)),
      );
    }),

  // The join to `accounts` is the read model too (#162): the page is global, so
  // each row has to name the mailbox it arrived in. Not to `messages` — a saved
  // promo carries its own copy of the mail precisely so it outlives the one it
  // came from, which the save has just trashed.
  saved: () =>
    Effect.promise(() => {
      const { db } = getDb();
      return db
        .select({ ...PROMO_COLUMNS, accountEmail: accounts.email })
        .from(promoCodes)
        .innerJoin(accounts, eq(accounts.id, promoCodes.accountId))
        .where(isNotNull(promoCodes.savedAt))
        .orderBy(desc(promoCodes.savedAt));
    }),

  markSaved: ({ id, savedAt, message }) =>
    Effect.gen(function* () {
      const { db } = getDb();
      yield* Effect.promise(() =>
        db
          .update(promoCodes)
          .set({ savedAt, ...message })
          .where(eq(promoCodes.id, id)),
      );
    }),

  patch: ({ id, fields }) =>
    Effect.gen(function* () {
      // Only the named fields: `set({})` is an error, and a patch that names
      // nothing is a no-op rather than one.
      const set = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      );
      if (Object.keys(set).length === 0) return;
      const { db } = getDb();
      yield* Effect.promise(() => db.update(promoCodes).set(set).where(eq(promoCodes.id, id)));
    }),

  remove: (id) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const removed = yield* Effect.promise(() =>
        db.delete(promoCodes).where(eq(promoCodes.id, id)).returning({ id: promoCodes.id }),
      );
      return removed.length;
    }),

  // `isNull(savedAt)` is the whole rule: a re-run replaces what the model last
  // guessed about this mail and never what the user chose to keep.
  removeUnsavedForMessage: ({ accountId, gmailMessageId }) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const removed = yield* Effect.promise(() =>
        db
          .delete(promoCodes)
          .where(
            and(
              eq(promoCodes.accountId, accountId),
              eq(promoCodes.gmailMessageId, gmailMessageId),
              isNull(promoCodes.savedAt),
            ),
          )
          .returning({ id: promoCodes.id }),
      );
      return removed.length;
    }),
};

const UPLOAD_COLUMNS = {
  id: composeUploads.id,
  accountId: composeUploads.accountId,
  filename: composeUploads.filename,
  mimeType: composeUploads.mimeType,
  size: composeUploads.size,
  createdAt: composeUploads.createdAt,
};

const SCHEDULED_COLUMNS = {
  id: scheduledSends.id,
  accountId: scheduledSends.accountId,
  kind: scheduledSends.kind,
  sourceGmailMessageId: scheduledSends.sourceGmailMessageId,
  payload: scheduledSends.payload,
  messageIdHeader: scheduledSends.messageIdHeader,
  sendAt: scheduledSends.sendAt,
  status: scheduledSends.status,
  attempts: scheduledSends.attempts,
  claimedAt: scheduledSends.claimedAt,
  sentAt: scheduledSends.sentAt,
  sentMessageId: scheduledSends.sentMessageId,
  threadId: scheduledSends.threadId,
  error: scheduledSends.error,
  createdAt: scheduledSends.createdAt,
};

const outboxImpl: OutboxStoreImpl = {
  putUpload: (row) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const [stored] = yield* Effect.promise(() =>
        db
          .insert(composeUploads)
          .values({ ...row, size: row.data.byteLength })
          .returning(UPLOAD_COLUMNS),
      );
      return stored;
    }),

  uploadsByIds: ({ accountId, ids }) =>
    Effect.gen(function* () {
      if (ids.length === 0) return [];
      const { db } = getDb();
      return yield* Effect.promise(() =>
        db
          .select({ ...UPLOAD_COLUMNS, data: composeUploads.data })
          .from(composeUploads)
          .where(
            and(eq(composeUploads.accountId, accountId), inArray(composeUploads.id, [...ids])),
          ),
      );
    }),

  removeUpload: ({ accountId, id }) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db
          .delete(composeUploads)
          .where(and(eq(composeUploads.accountId, accountId), eq(composeUploads.id, id)))
          .returning({ id: composeUploads.id }),
      );
      return rows.length;
    }),

  // An upload a send that has not gone out yet still names is kept, whatever
  // its age: that send will need the bytes when it fires.
  sweepUploads: (createdBefore) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db
          .delete(composeUploads)
          .where(
            and(
              lt(composeUploads.createdAt, createdBefore),
              sql`${composeUploads.id}::text NOT IN (
                SELECT jsonb_array_elements_text(coalesce(${scheduledSends.payload} -> 'uploadIds', '[]'::jsonb))
                FROM ${scheduledSends}
                WHERE ${scheduledSends.status} IN ('pending', 'sending')
              )`,
            ),
          )
          .returning({ id: composeUploads.id }),
      );
      return rows.length;
    }),

  schedule: (row) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const [stored] = yield* Effect.promise(() =>
        db.insert(scheduledSends).values(row).returning(SCHEDULED_COLUMNS),
      );
      return stored;
    }),

  scheduledById: (id) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db.select(SCHEDULED_COLUMNS).from(scheduledSends).where(eq(scheduledSends.id, id)).limit(1),
      );
      return rows[0] ?? null;
    }),

  scheduledList: ({ accountId, statuses }) =>
    Effect.gen(function* () {
      if (statuses.length === 0) return [];
      const { db } = getDb();
      const conditions: SQL[] = [inArray(scheduledSends.status, [...statuses])];
      if (accountId) conditions.push(eq(scheduledSends.accountId, accountId));
      return yield* Effect.promise(() =>
        db
          .select(SCHEDULED_COLUMNS)
          .from(scheduledSends)
          .where(and(...conditions))
          .orderBy(asc(scheduledSends.sendAt), asc(scheduledSends.createdAt)),
      );
    }),

  cancelScheduled: (id) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db
          .update(scheduledSends)
          .set({ status: "cancelled" })
          .where(and(eq(scheduledSends.id, id), eq(scheduledSends.status, "pending")))
          .returning({ id: scheduledSends.id }),
      );
      return rows.length;
    }),

  reschedule: ({ id, sendAt }) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const rows = yield* Effect.promise(() =>
        db
          .update(scheduledSends)
          .set({ status: "pending", sendAt, error: null, attempts: 0, claimedAt: null })
          .where(
            and(eq(scheduledSends.id, id), inArray(scheduledSends.status, ["pending", "failed"])),
          )
          .returning({ id: scheduledSends.id }),
      );
      return rows.length;
    }),

  // One statement: the subquery locks the rows it picks (skipping any another
  // claimer holds) and the update moves them to `sending`, so a row is handed
  // to one caller however many ticks race for it.
  claimDue: ({ now, staleBefore, limit }) =>
    Effect.promise(() => {
      const { db } = getDb();
      const due = db
        .select({ id: scheduledSends.id })
        .from(scheduledSends)
        .where(
          or(
            and(eq(scheduledSends.status, "pending"), lte(scheduledSends.sendAt, now)),
            and(eq(scheduledSends.status, "sending"), lt(scheduledSends.claimedAt, staleBefore)),
          ),
        )
        .orderBy(asc(scheduledSends.sendAt))
        .limit(limit)
        .for("update", { skipLocked: true });
      return db
        .update(scheduledSends)
        .set({
          status: "sending",
          claimedAt: now,
          attempts: sql`${scheduledSends.attempts} + 1`,
        })
        .where(inArray(scheduledSends.id, due))
        .returning(SCHEDULED_COLUMNS);
    }),

  finishScheduled: ({ id, outcome }) =>
    Effect.gen(function* () {
      const { db } = getDb();
      const set =
        outcome.kind === "sent"
          ? {
              status: "sent" as const,
              sentAt: outcome.sentAt,
              sentMessageId: outcome.sentMessageId,
              threadId: outcome.threadId,
              error: null,
            }
          : outcome.kind === "failed"
            ? { status: "failed" as const, error: outcome.error }
            : { status: "pending" as const, sendAt: outcome.sendAt, error: outcome.error };
      yield* Effect.promise(() =>
        db
          .update(scheduledSends)
          .set(set)
          .where(and(eq(scheduledSends.id, id), eq(scheduledSends.status, "sending"))),
      );
    }),
};

const contactsImpl: ContactStoreImpl = {
  record: (rows) =>
    Effect.gen(function* () {
      if (rows.length === 0) return;
      const { db } = getDb();
      // One sighting per address per call, the newest: a batch naming the same
      // person twice must not upsert one row twice in a single statement.
      const newest = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        const key = `${row.accountId}|${row.email.toLowerCase()}`;
        const seen = newest.get(key);
        if (!seen || row.contactedAt > seen.contactedAt) newest.set(key, row);
      }
      const values = [...newest.values()].map((row) => ({
        accountId: row.accountId,
        email: row.email.toLowerCase(),
        name: row.name,
        timesContacted: 1,
        lastContactedAt: row.contactedAt,
      }));
      yield* Effect.promise(() =>
        db
          .insert(contacts)
          .values(values)
          .onConflictDoUpdate({
            target: [contacts.accountId, contacts.email],
            set: {
              timesContacted: sql`CASE WHEN excluded.last_contacted_at > ${contacts.lastContactedAt} THEN ${contacts.timesContacted} + 1 ELSE ${contacts.timesContacted} END`,
              lastContactedAt: sql`GREATEST(${contacts.lastContactedAt}, excluded.last_contacted_at)`,
              name: sql`COALESCE(${contacts.name}, excluded.name)`,
            },
          }),
      );
    }),

  search: ({ accountId, query, limit }) =>
    Effect.promise(() => {
      const { db } = getDb();
      const q = query.trim();
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const conditions: SQL[] = [eq(contacts.accountId, accountId)];
      if (q.length > 0) {
        conditions.push(or(ilike(contacts.email, pattern), ilike(contacts.name, pattern))!);
      }
      return db
        .select({
          accountId: contacts.accountId,
          email: contacts.email,
          name: contacts.name,
          timesContacted: contacts.timesContacted,
          lastContactedAt: contacts.lastContactedAt,
        })
        .from(contacts)
        .where(and(...conditions))
        .orderBy(desc(contacts.timesContacted), desc(contacts.lastContactedAt), asc(contacts.email))
        .limit(limit);
    }),
};

export const SettingsStoreLive = Layer.succeed(SettingsStore, settingsImpl);
export const SecretStoreLive = Layer.succeed(SecretStore, secretsImpl);
export const MessageStoreLive = Layer.succeed(MessageStore, messagesImpl);
export const TriageStoreLive = Layer.succeed(TriageStore, triagesImpl);
export const LabelStoreLive = Layer.succeed(LabelStore, labelsImpl);
export const PromoStoreLive = Layer.succeed(PromoStore, promosImpl);
export const OutboxStoreLive = Layer.succeed(OutboxStore, outboxImpl);
export const ContactStoreLive = Layer.succeed(ContactStore, contactsImpl);

/** Every store, for the boundary that runs a storage-touching effect. */
export const StoresLive = Layer.mergeAll(
  SettingsStoreLive,
  SecretStoreLive,
  MessageStoreLive,
  TriageStoreLive,
  LabelStoreLive,
  PromoStoreLive,
  OutboxStoreLive,
  ContactStoreLive,
);

/**
 * The Promise facade's one line: run against Postgres, rethrowing the original
 * failure the way `runPromiseRethrow` does. Every service facade uses this
 * instead of naming the layer, so "production answers the `R` channel here"
 * is one import rather than a `Effect.provide` at each of forty call sites.
 */
export const runWithStores = <A, E>(eff: Effect.Effect<A, E, Stores>): Promise<A> =>
  runPromiseRethrow(Effect.provide(eff, StoresLive));
