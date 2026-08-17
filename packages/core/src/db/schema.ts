import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const priorityEnum = pgEnum("priority", ["high", "medium", "low"]);
export const suggestionStatusEnum = pgEnum("suggestion_status", [
  "pending",
  "applied",
  "dismissed",
]);

export const filterSuggestionStatusEnum = pgEnum("filter_suggestion_status", [
  "pending",
  "accepted",
  "dismissed",
]);

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

export const triageLabelSuggestions = pgTable(
  "triage_label_suggestions",
  {
    triageId: uuid("triage_id")
      .notNull()
      .references(() => triages.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    status: suggestionStatusEnum("status").notNull().default("pending"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.triageId, t.labelId] }),
  }),
);

export const suggestedLabels = pgTable("suggested_labels", {
  id: uuid("id").defaultRandom().primaryKey(),
  triageId: uuid("triage_id")
    .notNull()
    .references(() => triages.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  reasoning: text("reasoning"),
  status: suggestionStatusEnum("status").notNull().default("pending"),
  createdLabelId: uuid("created_label_id").references(() => labels.id),
});

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

export const suggestedFilters = pgTable(
  "suggested_filters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    criteriaFrom: text("criteria_from"),
    criteriaSubject: text("criteria_subject"),
    criteriaQuery: text("criteria_query"),
    addLabelId: uuid("add_label_id").references(() => labels.id, {
      onDelete: "set null",
    }),
    addLabelName: text("add_label_name").notNull(),
    reasoning: text("reasoning"),
    status: filterSuggestionStatusEnum("status").notNull().default("pending"),
    createdGmailFilterId: text("created_gmail_filter_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => ({
    byAccount: index("suggested_filters_account").on(t.accountId, t.status),
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
    suggestedNewLabels: integer("suggested_new_labels").notNull().default(0),
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
