import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  foreignKey,
  primaryKey,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";

/** Raw bytes — a staged attachment's content (`compose_uploads.data`). */
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

export const priorityEnum = pgEnum("priority", ["high", "medium", "low"]);
export const syncWindowStatusEnum = pgEnum("sync_window_status", [
  "running",
  "completed",
  "failed",
]);

export const runTriggerEnum = pgEnum("run_trigger", ["manual", "automatic"]);

export const triageRunStatusEnum = pgEnum("triage_run_status", ["running", "completed", "failed"]);

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  // The user's own name for the mailbox ("Lucas — Pro"), shown by the account
  // switcher and the From menu. Null means "use the Google display name".
  nickname: text("nickname"),
  avatarUrl: text("avatar_url"),
  // Google OAuth refresh token (AES-256-GCM ciphertext via util/crypto), plus
  // the scopes granted and when the grant was last established. Nullable: a row
  // can exist before the account is connected or after the grant is revoked
  // (→ AccountNotConnectedError until reconnected).
  refreshToken: text("refresh_token"),
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
});

export const labels = pgTable(
  "labels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    gmailLabelId: text("gmail_label_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull().default("user"),
    colorBg: text("color_bg"),
    colorFg: text("color_fg"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byAccountGmailId: uniqueIndex("labels_account_gmail_id").on(t.accountId, t.gmailLabelId),
    byAccountName: index("labels_account_name").on(t.accountId, t.name),
  }),
);

export const messages = pgTable(
  "messages",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    gmailMessageId: text("gmail_message_id").notNull(),
    gmailThreadId: text("gmail_thread_id").notNull(),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    toEmails: jsonb("to_emails").$type<string[]>().notNull().default([]),
    subject: text("subject"),
    snippet: text("snippet"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    internalDate: timestamp("internal_date", { withTimezone: true }).notNull(),
    rawHeaders: jsonb("raw_headers").$type<Record<string, string>>(),
    isArchived: boolean("is_archived").notNull().default(false),
    isTrashed: boolean("is_trashed").notNull().default(false),
    // Soft-remove marker for messages that vanished from Gmail (trashed or
    // permanently deleted) between syncs. Set by the sync reconciliation step
    // (services/sync/reconcile.ts); nullable so we keep triages/labels intact
    // and can restore if the message reappears.
    removedAt: timestamp("removed_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.accountId, t.gmailMessageId] }),
    byThread: index("messages_thread").on(t.accountId, t.gmailThreadId),
    byDate: index("messages_internal_date").on(t.internalDate),
    byAccountDate: index("messages_account_internal_date").on(t.accountId, t.internalDate),
  }),
);

export const messageAttachments = pgTable(
  "message_attachments",
  {
    accountId: uuid("account_id").notNull(),
    gmailMessageId: text("gmail_message_id").notNull(),
    // Gmail's attachmentId is opaque per (message, part) and stable for the
    // lifetime of the message; pairing it with the message PK is unique.
    attachmentId: text("attachment_id").notNull(),
    filename: text("filename").notNull().default(""),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    size: integer("size").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.accountId, t.gmailMessageId, t.attachmentId],
    }),
    byMessage: index("message_attachments_message").on(t.accountId, t.gmailMessageId),
  }),
);

export const messageLabels = pgTable(
  "message_labels",
  {
    accountId: uuid("account_id").notNull(),
    gmailMessageId: text("gmail_message_id").notNull(),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.accountId, t.gmailMessageId, t.labelId],
    }),
  }),
);

export const triages = pgTable(
  "triages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull(),
    gmailMessageId: text("gmail_message_id").notNull(),
    priority: priorityEnum("priority").notNull(),
    reasoning: text("reasoning").notNull(),
    claudeRunId: text("claude_run_id"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byMsg: index("triages_msg").on(t.accountId, t.gmailMessageId, t.createdAt),
  }),
);

export const gmailFilters = pgTable(
  "gmail_filters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    gmailFilterId: text("gmail_filter_id").notNull(),
    criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull(),
    action: jsonb("action").$type<Record<string, unknown>>().notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byAccountGmailId: uniqueIndex("gmail_filters_account_gmail_id").on(
      t.accountId,
      t.gmailFilterId,
    ),
  }),
);

export const syncWindows = pgTable(
  "sync_windows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    rangeFrom: timestamp("range_from", { withTimezone: true }).notNull(),
    rangeTo: timestamp("range_to", { withTimezone: true }).notNull(),
    query: text("query").notNull(),
    status: syncWindowStatusEnum("status").notNull().default("running"),
    trigger: runTriggerEnum("trigger").notNull().default("manual"),
    messagesFetched: integer("messages_fetched").notNull().default(0),
    messagesNew: integer("messages_new").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    byAccountRange: index("sync_windows_account_range").on(t.accountId, t.rangeFrom, t.rangeTo),
    byStartedAt: index("sync_windows_started_at").on(t.startedAt),
  }),
);

export const triageRuns = pgTable(
  "triage_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    syncWindowId: uuid("sync_window_id").references(() => syncWindows.id, {
      onDelete: "set null",
    }),
    trigger: runTriggerEnum("trigger").notNull().default("manual"),
    status: triageRunStatusEnum("status").notNull().default("running"),
    candidates: integer("candidates").notNull().default(0),
    triaged: integer("triaged").notNull().default(0),
    failedBatches: integer("failed_batches").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    byAccountStarted: index("triage_runs_account_started").on(t.accountId, t.startedAt),
    byStartedAt: index("triage_runs_started_at").on(t.startedAt),
  }),
);

/**
 * One discount code extracted from a marketing mail (#154, #157).
 *
 * A row is in one of two states, and `saved_at` is what says which: **suggested**
 * (the extraction wrote it during sync, and it shows above the inbox list) or
 * **saved** (the user pressed the one button, and the mail was trashed in Gmail).
 * The extraction costs a model call, so its answer is persisted where it is made
 * rather than derived on every render.
 *
 * The first five columns are the extracted fields — the model's guesses on
 * deliberately slippery marketing prose, and the only part a user may edit.
 * `expires_at` is stored at end-of-day UTC and treated as a date, never an
 * instant: a promo reading expired while the shop still honours it is the
 * annoying failure, and the reverse costs one failed checkout attempt.
 *
 * The six columns after `created_at` are a copy of the mail, written at save
 * time and never after. The mail is being trashed in Gmail, so this copy is the
 * only version the user will ever see again — it is what makes a saved promo
 * independent of its `messages` row and what outlives Gmail's own trash purge.
 * That is also why the FK cascades from the account rather than being relied on
 * for the record: disconnecting an account takes its data wholesale, as it does
 * everywhere else in this schema.
 */
export const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull(),
    gmailMessageId: text("gmail_message_id").notNull(),
    // The five extracted fields. Only `discount` is required: an offer can need
    // no code, state no terms, name no merchant, and an expiry is never guessed.
    code: text("code"),
    discount: text("discount").notNull(),
    terms: text("terms"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    merchant: text("merchant"),
    savedAt: timestamp("saved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // The copy of the mail, all null until the save writes them together.
    subject: text("subject"),
    fromName: text("from_name"),
    fromEmail: text("from_email"),
    internalDate: timestamp("internal_date", { withTimezone: true }),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
  },
  (t) => ({
    message: foreignKey({
      columns: [t.accountId, t.gmailMessageId],
      foreignColumns: [messages.accountId, messages.gmailMessageId],
      name: "promo_codes_message_fk",
    }).onDelete("cascade"),
    // The suggestions read is one account's unsaved rows; the page is every
    // account's saved ones.
    byAccountSaved: index("promo_codes_account_saved").on(t.accountId, t.savedAt),
    bySavedAt: index("promo_codes_saved_at").on(t.savedAt),
  }),
);

/**
 * Every secret miel holds that is not a Gmail refresh token: one row per
 * secret, the value AES-256-GCM ciphertext (util/crypto), the name an opaque
 * string PK.
 *
 * Two kinds of name live here, and the table is deliberately indifferent to
 * which is which:
 *
 *   - an LLM vendor (`anthropic`, `google`, `openai`) — that vendor's API key.
 *     Issued per vendor rather than per task, so triage / reply / filter-suggest
 *     all read the same row (#104).
 *   - a dotted integration key (`worp.api_key`, `worp.extra_headers`,
 *     `claude_code.oauth_token`) — an outbound integration's credential (#107)
 *     or a CLI's token (#109).
 *
 * It was `provider_credentials` keyed by vendor until #107 needed to store
 * worp's key the same way; generalising the key beat standing up a parallel
 * worp-only table with identical columns. Migration 0011 does the rename.
 *
 * Never selected outward: `services/encryptedSecrets.ts` is the only reader,
 * and everything above it sees a boolean or a masked hint.
 */
export const encryptedSecrets = pgTable("encrypted_secrets", {
  name: text("name").primaryKey(),
  encryptedValue: text("encrypted_value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A snoozed conversation: miel's own, because Gmail's API exposes no snooze.
 *
 * Snoozing archives the thread in Gmail (INBOX off, exactly as archive does)
 * and writes this row; the API process's due-work loop wakes it at `wake_at` by
 * putting INBOX back and marking the snoozed message unread, then deletes the
 * row. Keyed by thread because Gmail archives whole threads: one row per
 * conversation, and snoozing it again moves the wake time rather than adding a
 * second row. `gmail_message_id` is the message the user snoozed — the one the
 * wake marks unread.
 *
 * Archived *and* snoozed is how the list tells the two apart: the Done view is
 * archived mail with no row here, the Snoozed view is mail with one.
 */
export const snoozes = pgTable(
  "snoozes",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    gmailThreadId: text("gmail_thread_id").notNull(),
    gmailMessageId: text("gmail_message_id").notNull(),
    wakeAt: timestamp("wake_at", { withTimezone: true }).notNull(),
    snoozedAt: timestamp("snoozed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.accountId, t.gmailThreadId] }),
    byWakeAt: index("snoozes_wake_at").on(t.wakeAt),
  }),
);

/**
 * A file the compose window uploaded for a send that has not happened yet.
 *
 * Upload-then-reference rather than a multipart send: the window uploads each
 * file as it is attached (which is what gives the design its per-file progress
 * and its "Send waits for uploads"), keeps the id, and every send, draft save or
 * scheduled send names the ids. The bytes live here rather than on disk so a
 * scheduled send survives a restart, and a container's filesystem is not
 * storage. Scoped to an account: a send from one mailbox cannot name another's
 * upload. Rows are swept a day after their upload unless a scheduled send that
 * has not gone out yet still names them.
 */
export const composeUploads = pgTable(
  "compose_uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byCreatedAt: index("compose_uploads_created_at").on(t.createdAt),
  }),
);

/** What a scheduled send will send: the send request, as the client made it. */
export interface ScheduledSendPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  /** A send-as alias of the account; absent is the account's own address. */
  from?: string;
  /** `compose_uploads` ids, kept alive by this row until it is sent. */
  uploadIds?: string[];
  /** A forward's kept attachments, by the original's Gmail attachment id. */
  forwardAttachmentIds?: string[];
  includeQuote?: boolean;
  quotedText?: string;
  replyAll?: boolean;
  draftId?: string;
}

export const scheduledSendStatusEnum = pgEnum("scheduled_send_status", [
  "pending",
  "sending",
  "sent",
  "failed",
  "cancelled",
]);

/**
 * Schedule send. Gmail's REST API has no scheduled send — its own
 * scheduled mail is a web-client feature with no endpoint — so miel holds the
 * message and the API process sends it when it is due.
 *
 * The row is a state machine: `pending` until it is due, `sending` once a tick
 * has claimed it (`claimed_at`, `attempts`), then `sent`, `failed` or — from
 * `pending` only — `cancelled`. The claim is a conditional update, so two ticks
 * (or two API processes) cannot both send one row; a row left in `sending` by a
 * process that died mid-send is reclaimed after a grace period, and before it is
 * sent again Gmail is searched for `message_id_header` — the Message-ID miel
 * wrote into the mail — so a send that did go out is recorded rather than
 * repeated.
 */
export const scheduledSends = pgTable(
  "scheduled_sends",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"new" | "reply" | "forward">().notNull(),
    // The message a reply or forward answers; Gmail's id, as everywhere else.
    sourceGmailMessageId: text("source_gmail_message_id"),
    payload: jsonb("payload").$type<ScheduledSendPayload>().notNull(),
    messageIdHeader: text("message_id_header").notNull(),
    sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
    status: scheduledSendStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentMessageId: text("sent_message_id"),
    threadId: text("thread_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byStatusSendAt: index("scheduled_sends_status_send_at").on(t.status, t.sendAt),
    byAccount: index("scheduled_sends_account").on(t.accountId, t.status),
  }),
);

/**
 * People an account has written to — what the compose window's address
 * suggestions are drawn from ("Suggestions come from people you've emailed").
 *
 * The inbox sync deliberately skips sent mail (`-in:sent`), so nothing in
 * `messages` knows who the user writes to. This table is filled from the two
 * places that do: a sync harvests the To/Cc/Bcc headers of the account's sent
 * mail in the same window (headers only, never a body, and nothing is added to
 * the inbox list), and every send through miel records its recipients.
 * `times_contacted` counts distinct sends, which is the ranking.
 */
export const contacts = pgTable(
  "contacts",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    // Lowercased: an address is case-insensitive, and one person is one row.
    email: text("email").notNull(),
    name: text("name"),
    timesContacted: integer("times_contacted").notNull().default(1),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.accountId, t.email] }),
    byAccountLast: index("contacts_account_last").on(t.accountId, t.lastContactedAt),
  }),
);
