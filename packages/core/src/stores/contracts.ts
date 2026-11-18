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
 * Both are `Context.Service` services, so the requirement rides in the `R` channel:
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
import { Context, Effect } from "effect";
import type { ScheduledSendPayload } from "../db/schema";
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

export class SettingsStore extends Context.Service<SettingsStore, SettingsStoreImpl>()(
  "SettingsStore",
) {}

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

export class SecretStore extends Context.Service<SecretStore, SecretStoreImpl>()("SecretStore") {}

/* ------------------------------------------------------------------------- *
 * The mailbox aggregates (#136)
 *
 * The same seam, extended to the two services the web app exercises daily:
 * `services/messages.ts` (listing, filtering, reading a detail) and
 * `services/apply.ts` (attaching labels, archiving, trashing, batch
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
 * labels a message carries, and every call to Gmail. Those are the rules the behaviour tests are about.
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
  /** The user's own name for the mailbox; null means the Google display name. */
  nickname: string | null;
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
  /**
   * Only the archived ones — the Done view. "Done" is Gmail's archive, not a
   * flag of miel's, so this is the other side of the inbox's own filter. It
   * wins over `includeArchived`; trashed and removed mail stay out unless asked
   * for, exactly as they do from the inbox.
   */
  archivedOnly?: boolean;
  /**
   * Only snoozed conversations — the Snoozed view. A snoozed thread is archived
   * in Gmail, so it is *also* excluded from the Done view: `archivedOnly` means
   * archived and not snoozed. Wins over both flags above.
   */
  snoozedOnly?: boolean;
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
  /** When its conversation wakes, if it is snoozed; null otherwise. */
  snoozedUntil: Date | null;
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
  /** When its conversation wakes, if it is snoozed; null otherwise. */
  snoozedUntil: Date | null;
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
  /** Set (or, with null, clear) an account's nickname; answers how many rows (0 or 1). */
  readonly setNickname: (args: { id: string; nickname: string | null }) => Effect.Effect<number>;
  /**
   * Snooze a conversation until `wakeAt`. Upsert on `(accountId, gmailThreadId)`:
   * snoozing a snoozed thread again moves its wake time.
   */
  readonly snooze: (row: SnoozeRow) => Effect.Effect<void>;
  /** Drop a thread's snooze; answers how many rows went (0 or 1). */
  readonly unsnooze: (args: { accountId: string; gmailThreadId: string }) => Effect.Effect<number>;
  /** The snoozes due at `now`, soonest first, each with its account's email. */
  readonly dueSnoozes: (args: { now: Date; limit: number }) => Effect.Effect<DueSnooze[]>;
}

/** A snoozed conversation: the thread, the message the user snoozed, and when it wakes. */
export interface SnoozeRow {
  accountId: string;
  gmailThreadId: string;
  gmailMessageId: string;
  wakeAt: Date;
}

/** A snooze the wake loop is about to act on — Gmail is addressed by email. */
export interface DueSnooze extends SnoozeRow {
  accountEmail: string;
}

export class MessageStore extends Context.Service<MessageStore, MessageStoreImpl>()(
  "MessageStore",
) {}

export interface StoredTriage {
  id: string;
  accountId: string;
  gmailMessageId: string;
  priority: PriorityT;
  reasoning: string;
  model: string | null;
  createdAt: Date;
}

/** `triages`: what Claude said about each message, one row per run. */
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
}

export class TriageStore extends Context.Service<TriageStore, TriageStoreImpl>()("TriageStore") {}

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

export class LabelStore extends Context.Service<LabelStore, LabelStoreImpl>()("LabelStore") {}

/* ------------------------------------------------------------------------- *
 * The promo aggregate (#157)
 *
 * `promo_codes`, the sixth store and the only new seam the promo-codes feature
 * adds. One row per extracted code, in one of two states: **suggested**, which
 * the extraction wrote, and **saved**, which the user asked for — `savedAt` is
 * what says which, and the copy of the mail beside it is written at that moment.
 *
 * The extraction cost a model call, so the row is persisted when it is made
 * rather than derived on read; the copy of the mail is denormalised because the
 * mail is being trashed in Gmail and this is the only version the user will ever
 * see again.
 * ------------------------------------------------------------------------- */

/**
 * The five extracted fields — the model's guesses, and the only part of a promo
 * a user may edit. The record beside them is a record.
 */
export interface PromoFields {
  /** null when the offer needs none ("applied at checkout"). */
  code: string | null;
  /** The badge headline — `20% off`. The one field an extraction must answer. */
  discount: string;
  /** The qualifying rest — `orders over £50, excl. sale`. */
  terms: string | null;
  /**
   * End-of-day UTC, treated as a date and never an instant: a promo reading
   * expired while the shop still honours it is the annoying failure, and the
   * reverse costs one failed checkout attempt. null when the mail states none —
   * an expiry is never guessed.
   */
  expiresAt: Date | null;
  /** The name a checkout would recognise; the sender's is the fallback. */
  merchant: string | null;
}

/** An extraction, keyed to the mail it came out of, before it has an id. */
export interface NewPromoCode extends PromoFields {
  readonly accountId: string;
  readonly gmailMessageId: string;
}

/** The copy of the mail, as `markSaved` is handed one. */
export interface PromoMessageCopy {
  subject: string | null;
  fromName: string | null;
  fromEmail: string;
  internalDate: Date;
  bodyHtml: string | null;
  bodyText: string | null;
}

/**
 * A promo as stored. The copy columns are null until the row is saved, which is
 * the one moment they are written — `savedAt` and they arrive together.
 */
export interface StoredPromoCode extends PromoFields {
  id: string;
  accountId: string;
  gmailMessageId: string;
  /** Non-null is the saved state; null is a suggestion nobody has acted on. */
  savedAt: Date | null;
  createdAt: Date;
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  internalDate: Date | null;
  bodyHtml: string | null;
  bodyText: string | null;
}

/**
 * A promo row plus the mailbox it arrived in — what both of the Promo Codes
 * page's reads answer (#162, #154).
 *
 * The email is the store's to answer for the reason a listed message carries
 * its account's — the row shape is what the seam promises, not the join that
 * produces it. The page is global and the account is a *column* on each row,
 * so a caller that had to resolve an id against a separate accounts read would
 * be doing this join itself, with one more way to get it wrong. It follows the
 * account: a promo whose account is gone has gone with it.
 */
export interface PromoCodeWithAccount extends StoredPromoCode {
  accountEmail: string;
}

/**
 * The mail an unsaved detection came from, as the suggestions read joins it:
 * metadata only, never a body. A suggestion has no copy of its mail (that is
 * written at save time), but its mail is still in the inbox — the read's own
 * rule — so the join can name it, which is what a "To review" card shows.
 */
export interface PromoMailSummary {
  subject: string | null;
  fromName: string | null;
  fromEmail: string;
  internalDate: Date;
}

/** An unsaved detection, with the mail it was read out of. */
export interface SuggestedPromoCode extends PromoCodeWithAccount {
  mail: PromoMailSummary;
}

/**
 * The suggestions read: unsaved detections whose mail is still in the inbox.
 *
 * Every field is optional, and which are named is what tells the two callers
 * apart. The inbox section names an account and a window, because it is showing
 * the period the list below it is; the Promo Codes page names neither, because
 * it is global and is where the detections the section's cap left out are
 * reachable.
 *
 * The window is the *message's* date, not the row's, which is why this read
 * spans two tables. The same join carries the mailbox rule with it whichever
 * caller asks: an unsaved detection follows its message, so one whose mail was
 * archived, trashed or removed is not suggested. Saving is the act that makes a
 * promo outlive its mail.
 */
export interface PromoSuggestionFilter {
  /** Absent means every account — the page, rather than one inbox. */
  accountId?: string;
  internalDateFrom?: Date;
  internalDateTo?: Date;
}

export interface PromoStoreImpl {
  /** The extractions of one sync; answers them as stored, ids and all. */
  readonly insert: (rows: readonly NewPromoCode[]) => Effect.Effect<StoredPromoCode[]>;
  /** One row, or null when no row has that id. */
  readonly byId: (id: string) => Effect.Effect<StoredPromoCode | null>;
  /**
   * The unsaved detections, newest mail first — an account's window, or every
   * account's when the filter names neither. Each row names its own mailbox,
   * for the reason a saved one does: the global read shows it as a column —
   * and its mail's subject, sender and date, which the join already has.
   */
  readonly unsaved: (filter: PromoSuggestionFilter) => Effect.Effect<SuggestedPromoCode[]>;
  /**
   * Every saved row, every account, newest saved first — the page is global,
   * because which mailbox a code arrived in is trivia at a checkout. Each row
   * names that mailbox all the same, so the page can show it as a column.
   */
  readonly saved: () => Effect.Effect<PromoCodeWithAccount[]>;
  /** Move a row to the saved state, with the copy of the mail taken then. */
  readonly markSaved: (args: {
    id: string;
    savedAt: Date;
    message: PromoMessageCopy;
  }) => Effect.Effect<void>;
  /** Patch the extracted fields; a field the patch does not name is left as stored. */
  readonly patch: (args: { id: string; fields: Partial<PromoFields> }) => Effect.Effect<void>;
  /** Drop the row; answers how many went (0 or 1). */
  readonly remove: (id: string) => Effect.Effect<number>;
  /**
   * Drop one message's *unsaved* detections; answers how many went (#165).
   *
   * What re-asking needs, and only re-asking: the sync extracts once and never
   * looks again, so nothing else here has ever had a previous answer to clear.
   * A manual run does, and writing beside the old one would leave a mail
   * showing the same offer twice.
   *
   * Saved rows are deliberately out of reach. A save is the user's decision and
   * carries the copy of a mail that is very often the only one left; a fresh
   * model answer is a guess, and a guess does not overwrite a decision.
   */
  readonly removeUnsavedForMessage: (ref: {
    accountId: string;
    gmailMessageId: string;
  }) => Effect.Effect<number>;
}

export class PromoStore extends Context.Service<PromoStore, PromoStoreImpl>()("PromoStore") {}

/* ------------------------------------------------------------------------- *
 * The outbox: staged uploads and scheduled sends
 *
 * One store for two tables because they share one rule: an upload a scheduled
 * send still names must outlive the sweep that drops every other upload a day
 * after it arrived. Splitting them would put that join in a service.
 * ------------------------------------------------------------------------- */

/** An uploaded attachment, without its bytes — what a listing or an upload answers. */
export interface StoredUpload {
  id: string;
  accountId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

/** The same upload with its bytes, for the send that spends it. */
export interface UploadWithData extends StoredUpload {
  data: Uint8Array;
}

export type ScheduledSendKind = "new" | "reply" | "forward";
export type ScheduledSendStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";

/** A scheduled send before it has an id. */
export interface NewScheduledSend {
  accountId: string;
  kind: ScheduledSendKind;
  sourceGmailMessageId: string | null;
  payload: ScheduledSendPayload;
  messageIdHeader: string;
  sendAt: Date;
}

export interface StoredScheduledSend extends NewScheduledSend {
  id: string;
  status: ScheduledSendStatus;
  attempts: number;
  claimedAt: Date | null;
  sentAt: Date | null;
  sentMessageId: string | null;
  threadId: string | null;
  error: string | null;
  createdAt: Date;
}

/** How a claimed send ended — the three ways out of `sending`. */
export type ScheduledSendOutcome =
  | { kind: "sent"; sentAt: Date; sentMessageId: string; threadId: string }
  | { kind: "failed"; error: string }
  /** Back to `pending` at a later time, with the error that sent it there. */
  | { kind: "retry"; sendAt: Date; error: string };

export interface OutboxStoreImpl {
  readonly putUpload: (row: {
    accountId: string;
    filename: string;
    mimeType: string;
    data: Uint8Array;
  }) => Effect.Effect<StoredUpload>;
  /** The named uploads that belong to the account, with their bytes; others are absent. */
  readonly uploadsByIds: (args: {
    accountId: string;
    ids: readonly string[];
  }) => Effect.Effect<UploadWithData[]>;
  /** Drop one of the account's uploads; answers how many went (0 or 1). */
  readonly removeUpload: (args: { accountId: string; id: string }) => Effect.Effect<number>;
  /**
   * Drop every upload created before `createdBefore` that no pending or
   * in-flight scheduled send names; answers how many went.
   */
  readonly sweepUploads: (createdBefore: Date) => Effect.Effect<number>;

  readonly schedule: (row: NewScheduledSend) => Effect.Effect<StoredScheduledSend>;
  readonly scheduledById: (id: string) => Effect.Effect<StoredScheduledSend | null>;
  /** The account's (or every account's) sends in the given states, soonest first. */
  readonly scheduledList: (args: {
    accountId?: string;
    statuses: readonly ScheduledSendStatus[];
  }) => Effect.Effect<StoredScheduledSend[]>;
  /** `pending` → `cancelled`; answers 1 when it moved, 0 when it was not pending. */
  readonly cancelScheduled: (id: string) => Effect.Effect<number>;
  /**
   * A new time for a `pending` or `failed` send, which becomes `pending` with its
   * error and attempts cleared; answers 1 when it moved, 0 otherwise.
   */
  readonly reschedule: (args: { id: string; sendAt: Date }) => Effect.Effect<number>;
  /**
   * Claim what is due, atomically: `pending` rows with `sendAt <= now`, and
   * `sending` rows claimed before `staleBefore` (a process that died mid-send).
   * Each becomes `sending` with `claimedAt = now` and one more attempt. A row is
   * handed to at most one caller.
   */
  readonly claimDue: (args: {
    now: Date;
    staleBefore: Date;
    limit: number;
  }) => Effect.Effect<StoredScheduledSend[]>;
  /** Record how a claimed (`sending`) send ended. */
  readonly finishScheduled: (args: {
    id: string;
    outcome: ScheduledSendOutcome;
  }) => Effect.Effect<void>;
}

export class OutboxStore extends Context.Service<OutboxStore, OutboxStoreImpl>()("OutboxStore") {}

/* ------------------------------------------------------------------------- *
 * Contacts — the address suggestions' source
 * ------------------------------------------------------------------------- */

export interface StoredContact {
  accountId: string;
  /** Lowercased. */
  email: string;
  name: string | null;
  timesContacted: number;
  lastContactedAt: Date;
}

export interface ContactSighting {
  accountId: string;
  email: string;
  name: string | null;
  /** When the mail that named them was sent. */
  contactedAt: Date;
}

export interface ContactStoreImpl {
  /**
   * Record that the account wrote to these people. Upsert on
   * `(accountId, lower(email))`: a sighting newer than the stored one counts one
   * more contact and moves `lastContactedAt`; an older or equal one counts
   * nothing (it is the same send seen again). A name fills a missing one.
   */
  readonly record: (rows: readonly ContactSighting[]) => Effect.Effect<void>;
  /**
   * The account's contacts whose address or name contains `query`
   * (case-insensitive; empty matches everyone), most contacted first, then most
   * recent.
   */
  readonly search: (args: {
    accountId: string;
    query: string;
    limit: number;
  }) => Effect.Effect<StoredContact[]>;
}

export class ContactStore extends Context.Service<ContactStore, ContactStoreImpl>()(
  "ContactStore",
) {}

/** The `R` of anything that reaches storage through the seam. */
export type Stores =
  | SettingsStore
  | SecretStore
  | MessageStore
  | TriageStore
  | LabelStore
  | PromoStore
  | OutboxStore
  | ContactStore;
