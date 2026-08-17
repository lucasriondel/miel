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
import { and, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "../db/client";
import {
  accounts,
  appSettings,
  encryptedSecrets,
  labels,
  messageAttachments,
  messageLabels,
  messages,
  suggestedLabels,
  triageLabelSuggestions,
  triages,
} from "../db/schema";
import { runPromiseRethrow } from "../util/effect";
import {
  LabelStore,
  MessageStore,
  SecretStore,
  SettingsStore,
  TriageStore,
  type LabelStoreImpl,
  type MessageRef,
  type MessageStoreImpl,
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

/** `triage_id IN (…)`, with the uuid casts Postgres needs on the literals. */
const triageIdsIn = (column: AnyPgColumn, ids: readonly string[]) =>
  sql`${column} IN (${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`;

const ACCOUNT_COLUMNS = {
  id: accounts.id,
  email: accounts.email,
  displayName: accounts.displayName,
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
      if (!filter.includeArchived) {
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
          })
          .from(messages)
          .innerJoin(accounts, eq(messages.accountId, accounts.id))
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

  existingSuggestionsFor: (triageIds) =>
    Effect.gen(function* () {
      if (triageIds.length === 0) return [];
      const { db } = getDb();
      return yield* Effect.promise(() =>
        db
          .select({
            triageId: triageLabelSuggestions.triageId,
            labelId: triageLabelSuggestions.labelId,
            status: triageLabelSuggestions.status,
            name: labels.name,
            colorBg: labels.colorBg,
            colorFg: labels.colorFg,
          })
          .from(triageLabelSuggestions)
          .innerJoin(labels, eq(triageLabelSuggestions.labelId, labels.id))
          .where(triageIdsIn(triageLabelSuggestions.triageId, triageIds)),
      );
    }),

  newSuggestionsFor: (triageIds) =>
    Effect.gen(function* () {
      if (triageIds.length === 0) return [];
      const { db } = getDb();
      return yield* Effect.promise(() =>
        db
          .select({
            suggestionId: suggestedLabels.id,
            triageId: suggestedLabels.triageId,
            name: suggestedLabels.name,
            reasoning: suggestedLabels.reasoning,
            status: suggestedLabels.status,
            createdLabelId: suggestedLabels.createdLabelId,
          })
          .from(suggestedLabels)
          .where(triageIdsIn(suggestedLabels.triageId, triageIds)),
      );
    }),

  markExistingApplied: ({ triageId, labelIds }) =>
    Effect.gen(function* () {
      if (labelIds.length === 0) return;
      const { db } = getDb();
      yield* Effect.promise(() =>
        db
          .update(triageLabelSuggestions)
          .set({ status: "applied" })
          .where(
            and(
              eq(triageLabelSuggestions.triageId, triageId),
              inArray(triageLabelSuggestions.labelId, [...labelIds]),
            ),
          ),
      );
    }),

  markNewApplied: ({ suggestionId, createdLabelId }) =>
    Effect.gen(function* () {
      const { db } = getDb();
      yield* Effect.promise(() =>
        db
          .update(suggestedLabels)
          .set({ status: "applied", createdLabelId })
          .where(eq(suggestedLabels.id, suggestionId)),
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

export const SettingsStoreLive = Layer.succeed(SettingsStore, settingsImpl);
export const SecretStoreLive = Layer.succeed(SecretStore, secretsImpl);
export const MessageStoreLive = Layer.succeed(MessageStore, messagesImpl);
export const TriageStoreLive = Layer.succeed(TriageStore, triagesImpl);
export const LabelStoreLive = Layer.succeed(LabelStore, labelsImpl);

/** Every store, for the boundary that runs a storage-touching effect. */
export const StoresLive = Layer.mergeAll(
  SettingsStoreLive,
  SecretStoreLive,
  MessageStoreLive,
  TriageStoreLive,
  LabelStoreLive,
);

/**
 * The Promise facade's one line: run against Postgres, rethrowing the original
 * failure the way `runPromiseRethrow` does. Every service facade uses this
 * instead of naming the layer, so "production answers the `R` channel here"
 * is one import rather than a `Effect.provide` at each of forty call sites.
 */
export const runWithStores = <A, E>(eff: Effect.Effect<A, E, Stores>): Promise<A> =>
  runPromiseRethrow(Effect.provide(eff, StoresLive));
