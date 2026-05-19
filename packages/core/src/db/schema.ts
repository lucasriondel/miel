import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
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

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    byAccountGmailId: uniqueIndex("labels_account_gmail_id").on(
      t.accountId,
      t.gmailLabelId,
    ),
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
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.accountId, t.gmailMessageId] }),
    byThread: index("messages_thread").on(t.accountId, t.gmailThreadId),
    byDate: index("messages_internal_date").on(t.internalDate),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    byMsg: index("triages_msg").on(
      t.accountId,
      t.gmailMessageId,
      t.createdAt,
    ),
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

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
