/**
 * Store contracts — the seam between the settings/secret services and Postgres
 * (#132).
 *
 * Both services used to build their own drizzle queries inline, so the only way
 * to test them was to fake `../db/client` process-wide and hand-roll a
 * query-builder chain matching the exact calls the implementation happened to
 * make. Those tests asserted query shapes, not behaviour, and the fakes leaked
 * across files because `mock.module` is process-global.
 *
 * A store is deliberately *narrow*: the tables one aggregate owns, the
 * operations its service actually makes, and no drizzle types in the
 * signatures. The Postgres adapters (`./postgres`) hold the queries; the
 * in-memory adapters (`../testkit/stores`) hold rows in memory. Two
 * implementations are what makes the seam real — a service that reaches past
 * them for a query no interface describes stops compiling.
 *
 * Both are `Effect.Tag` services, so the requirement rides in the `R` channel:
 * production provides {@link StoresLive} at the Promise boundary, tests provide
 * the testkit layer, and an effect with neither cannot be run at all. That is
 * the point — a test that forgets to inject gets a type error rather than a
 * connection attempt against a database it has no daemon for.
 *
 * Failures stay defects, matching the `Effect.promise` the queries used to be
 * lifted with: a store that cannot be reached is an outage, not a value the
 * caller chooses between. `services/claudeCodeToken.ts` depends on that — it
 * must fail loudly rather than report "no token" when the row cannot be read.
 *
 * None of this is in `packages/core/src/index.ts`, deliberately: every caller
 * outside core reaches settings and secrets through a Promise facade, which
 * provides the Postgres adapter itself. A store is a seam within core, not part
 * of its surface.
 */
import { Effect } from "effect";
import type { PriorityT } from "../schemas/triage";

/**
 * `app_settings`, as the settings service needs it: one string value per key.
 *
 * `read` answers null for a key with no row — the service, not the store,
 * decides what a missing row falls back to.
 */
export interface SettingsStoreImpl {
  readonly read: (key: string) => Effect.Effect<string | null>;
  /** Upsert: a key that already has a row takes the new value. */
  readonly write: (key: string, value: string) => Effect.Effect<void>;
}

export class SettingsStore extends Effect.Tag("SettingsStore")<
  SettingsStore,
  SettingsStoreImpl
>() {}

/**
 * `encrypted_secrets`, as the secrets service needs it: one ciphertext per
 * name.
 *
 * Ciphertext in, ciphertext out — the argument and the result are the stored
 * blob, never a plaintext. `services/encryptedSecrets.ts` stays the only module
 * that encrypts or decrypts, so a store (and anything that substitutes for one)
 * cannot see a secret even by accident.
 */
export interface SecretStoreImpl {
  /** The stored ciphertext for a name, or null when the name has no row. */
  readonly read: (name: string) => Effect.Effect<string | null>;
  /** Upsert the ciphertext under a name. */
  readonly write: (name: string, ciphertext: string) => Effect.Effect<void>;
  /** Drop the name's row; answers how many rows went (0 or 1). */
  readonly remove: (name: string) => Effect.Effect<number>;
}

export class SecretStore extends Effect.Tag("SecretStore")<SecretStore, SecretStoreImpl>() {}

/* ------------------------------------------------------------------------- *
 * The mailbox aggregates (#136)
 *
 * The same seam, extended to the two services the web app exercises daily:
 * `services/messages.ts` (listing, filtering, reading a detail) and
 * `services/apply.ts` (accepting suggestions, archiving, trashing, batch
 * actions). Neither had a single test, because testing either meant faking
 * `db/client` and hand-rolling the drizzle chain each query happened to make.
 *
 * Three stores rather than one, split the way the services own their tables:
 * mailbox rows (`MessageStore`), what Claude said about them (`TriageStore`),
 * and the label catalogue both of them attach from (`LabelStore`). A store
 * spans more than one table where the *read model* does — a listed message
 * carries its account's email and its newest triage's priority, and the row
 * shape is what the seam promises, not the join that produces it.
 *
 * What deliberately stays in the services: the cursor's encoding, which
 * suggestions count as pending, what "already applied" means, and every call
 * to Gmail. Those are the rules the behaviour tests are about.
 * ------------------------------------------------------------------------- */

/** A message, identified the way `messages` is keyed. */
export interface MessageRef {
  readonly accountId: string;
  readonly gmailMessageId: string;
}

/** A connected account, as the mailbox reads need it. */
export interface StoredAccount {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  lastSyncedAt: Date | null;
}

/** Which of the two soft-state flags a write sets; an absent one is left alone. */
export interface MessageFlags {
  isArchived?: boolean;
  isTrashed?: boolean;
}

/**
 * One page of the message list, in store terms: every filter the list offers,
 * plus the keyset cursor as a decoded pair. The service encodes and decodes
 * that cursor — a store is handed a position, never a base64 string.
 */
export interface MessageListFilter {
  accountId?: string;
  labelId?: string;
  priority?: PriorityT;
  includeArchived?: boolean;
  includeTrashed?: boolean;
  includeRemoved?: boolean;
  internalDateFrom?: Date;
  internalDateTo?: Date;
  /** Strictly older than this `(internalDate, gmailMessageId)` pair. */
  olderThan?: { internalDate: Date; gmailMessageId: string };
  limit: number;
}

/** A row of the list read model: the message, its account, its newest triage. */
export interface ListedMessageRow {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string | null;
  snippet: string | null;
  internalDate: Date;
  isArchived: boolean;
  isTrashed: boolean;
  /** From the newest triage of this message; null when it has none. */
  priority: PriorityT | null;
  triageId: string | null;
}

/** The detail read model: the same message with its body and headers. */
export interface StoredMessage {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  internalDate: Date;
  isArchived: boolean;
  isTrashed: boolean;
  rawHeaders: Record<string, string> | null;
}

/** A label attached to a message, with the label's own columns joined on. */
export interface MessageLabelRow extends MessageRef {
  labelId: string;
  name: string;
  gmailLabelId: string;
  colorBg: string | null;
  colorFg: string | null;
}

export interface StoredAttachment extends MessageRef {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * `accounts`, `messages`, `message_labels` and `message_attachments` — the rows
 * a mailbox is made of, read as a page or as one message, and the writes the
 * message actions make to them.
 */
export interface MessageStoreImpl {
  /** Newest first, at most `limit` rows, filters applied before the limit. */
  readonly list: (filter: MessageListFilter) => Effect.Effect<ListedMessageRow[]>;
  readonly detail: (ref: MessageRef) => Effect.Effect<StoredMessage | null>;
  /** The message's thread, or null when the message is not stored. */
  readonly threadIdOf: (ref: MessageRef) => Effect.Effect<string | null>;
  /** Every label on every named message; an empty list of refs reads nothing. */
  readonly labelsFor: (refs: readonly MessageRef[]) => Effect.Effect<MessageLabelRow[]>;
  readonly attachmentsFor: (refs: readonly MessageRef[]) => Effect.Effect<StoredAttachment[]>;
  /** Attach every label to every message; already-attached pairs are left alone. */
  readonly attachLabels: (args: {
    accountId: string;
    gmailMessageIds: readonly string[];
    labelIds: readonly string[];
  }) => Effect.Effect<void>;
  readonly detachLabels: (args: {
    accountId: string;
    gmailMessageIds: readonly string[];
    labelIds: readonly string[];
  }) => Effect.Effect<void>;
  readonly setFlagsForMessages: (args: {
    accountId: string;
    gmailMessageIds: readonly string[];
    flags: MessageFlags;
  }) => Effect.Effect<void>;
  /** Gmail archives and trashes whole threads, so miel marks whole threads. */
  readonly setFlagsForThread: (args: {
    accountId: string;
    gmailThreadId: string;
    flags: MessageFlags;
  }) => Effect.Effect<void>;
  /** Every connected account, by email. */
  readonly accounts: () => Effect.Effect<StoredAccount[]>;
  readonly accountById: (id: string) => Effect.Effect<StoredAccount | null>;
  readonly accountByEmail: (email: string) => Effect.Effect<StoredAccount | null>;
}

export class MessageStore extends Effect.Tag("MessageStore")<MessageStore, MessageStoreImpl>() {}

export type SuggestionStatus = "pending" | "applied" | "dismissed";

export interface StoredTriage {
  id: string;
  accountId: string;
  gmailMessageId: string;
  priority: PriorityT;
  reasoning: string;
  model: string | null;
  createdAt: Date;
}

/** A suggestion of a label that already exists, with that label joined on. */
export interface StoredExistingSuggestion {
  triageId: string;
  labelId: string;
  status: SuggestionStatus;
  name: string;
  colorBg: string | null;
  colorFg: string | null;
}

/** A suggestion of a label that does not exist yet. */
export interface StoredNewSuggestion {
  suggestionId: string;
  triageId: string;
  name: string;
  reasoning: string | null;
  status: SuggestionStatus;
  createdLabelId: string | null;
}

/**
 * `triages` and the two suggestion tables hanging off them.
 *
 * Statuses come back as stored: which of them counts as "pending", and what a
 * pending suggestion for an already-attached label means, is the messages
 * service's rule and stays there.
 */
export interface TriageStoreImpl {
  /** Every triage of a message, newest first. */
  readonly historyFor: (ref: MessageRef) => Effect.Effect<StoredTriage[]>;
  readonly byId: (triageId: string) => Effect.Effect<StoredTriage | null>;
  readonly insert: (row: {
    accountId: string;
    gmailMessageId: string;
    priority: PriorityT;
    reasoning: string;
    model?: string | null;
  }) => Effect.Effect<void>;
  readonly existingSuggestionsFor: (
    triageIds: readonly string[],
  ) => Effect.Effect<StoredExistingSuggestion[]>;
  readonly newSuggestionsFor: (
    triageIds: readonly string[],
  ) => Effect.Effect<StoredNewSuggestion[]>;
  readonly markExistingApplied: (args: {
    triageId: string;
    labelIds: readonly string[];
  }) => Effect.Effect<void>;
  readonly markNewApplied: (args: {
    suggestionId: string;
    createdLabelId: string;
  }) => Effect.Effect<void>;
}

export class TriageStore extends Effect.Tag("TriageStore")<TriageStore, TriageStoreImpl>() {}

export interface StoredLabel {
  id: string;
  accountId: string;
  gmailLabelId: string;
  name: string;
  type: string;
  colorBg: string | null;
  colorFg: string | null;
}

/** A label as Gmail describes it, before it has an id of ours. */
export interface NewLabelRow {
  accountId: string;
  gmailLabelId: string;
  name: string;
  type: string;
  colorBg: string | null;
  colorFg: string | null;
}

/**
 * `labels` — the catalogue both services attach from.
 *
 * Every lookup is scoped to an account, because a label id is only meaningful
 * inside one: attaching by id without that scope would let one account's
 * request name another's label.
 */
export interface LabelStoreImpl {
  readonly byAccount: (accountId: string) => Effect.Effect<StoredLabel[]>;
  readonly byIds: (args: {
    accountId: string;
    ids: readonly string[];
  }) => Effect.Effect<StoredLabel[]>;
  readonly byGmailIds: (args: {
    accountId: string;
    gmailLabelIds: readonly string[];
  }) => Effect.Effect<StoredLabel[]>;
  readonly byName: (args: { accountId: string; name: string }) => Effect.Effect<StoredLabel | null>;
  /** Upsert on `(accountId, gmailLabelId)`; answers the rows as stored. */
  readonly upsert: (rows: readonly NewLabelRow[]) => Effect.Effect<StoredLabel[]>;
}

export class LabelStore extends Effect.Tag("LabelStore")<LabelStore, LabelStoreImpl>() {}

/** The `R` of anything that reaches storage through the seam. */
export type Stores = SettingsStore | SecretStore | MessageStore | TriageStore | LabelStore;
