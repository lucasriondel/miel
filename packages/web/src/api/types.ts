export interface Account {
  id: string;
  email: string;
  displayName: string | null;
  /** This install's own name for the mailbox (`PATCH /accounts/:id`); Gmail is not told. */
  nickname: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastSyncedAt: string | null;
}

export interface Label {
  id: string;
  accountId: string;
  gmailLabelId: string;
  name: string;
  type: string;
  colorBg: string | null;
  colorFg: string | null;
}

export type Priority = "high" | "medium" | "low";

export interface MessageLabel {
  id: string;
  name: string;
  gmailLabelId: string;
  colorBg: string | null;
  colorFg: string | null;
}

export interface MessageAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ListedMessage {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string | null;
  snippet: string | null;
  internalDate: string;
  isArchived: boolean;
  isTrashed: boolean;
  priority: Priority | null;
  triageId: string | null;
  labels: MessageLabel[];
  attachments: MessageAttachment[];
  /** When a snoozed conversation comes back to the inbox; null when it is not snoozed. */
  snoozedUntil: string | null;
}

export interface ListMessagesResponse {
  items: ListedMessage[];
  nextCursor: string | null;
}

export interface MessageDetail {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  /** The original's Cc, parsed off its stored headers. */
  ccEmails: string[];
  /**
   * Who reply-all copies by default — the other participants, minus this
   * account and the sender. Empty: reply-all would reach nobody a reply does not.
   */
  replyAllCc: string[];
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  internalDate: string;
  isArchived: boolean;
  isTrashed: boolean;
  rawHeaders: Record<string, string> | null;
  labels: MessageLabel[];
  attachments: MessageAttachment[];
  /** When a snoozed conversation comes back to the inbox; null when it is not snoozed. */
  snoozedUntil: string | null;
  latestTriageId: string | null;
  triageHistory: {
    id: string;
    priority: Priority;
    reasoning: string;
    model: string | null;
    createdAt: string;
  }[];
}

export interface SyncRunResult {
  account: string;
  fetched: number;
  triaged: number;
  filtersSynced: number;
  /** Promo codes found in this run's new mail; 0 from an API that predates the field. */
  promosFound: number;
  errors: string[];
}

export interface GmailFilter {
  id: string;
  accountId: string;
  gmailFilterId: string;
  criteria: {
    from?: string;
    to?: string;
    subject?: string;
    query?: string;
    negatedQuery?: string;
    hasAttachment?: boolean;
    excludeChats?: boolean;
    [k: string]: unknown;
  };
  action: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
    forward?: string;
    [k: string]: unknown;
  };
  syncedAt: string;
}

/** What `POST /filters/merge` answers with — see core's `MergeFiltersResult`. */
export interface MergeFiltersResult {
  /** The filter that now stands for all the merged ones. */
  filter: GmailFilter;
  /** Sources Gmail actually dropped, and so were forgotten locally too. */
  deletedGmailFilterIds: string[];
  /** Sources Gmail refused to drop — they still exist, and still match. */
  failedDeletions: { gmailFilterId: string; message: string }[];
}

export interface FiltersResponse {
  filters: GmailFilter[];
}

/**
 * One promo suggestion (#160) — a code the sync's extraction found in a mail
 * the current view is showing, before anyone has saved it. Its own payload
 * rather than a field on `ListedMessage`: the two have different lifetimes, and
 * the message list is sent for every row.
 */
export interface PromoSuggestion {
  id: string;
  accountId: string;
  gmailMessageId: string;
  code: string | null;
  discount: string;
  terms: string | null;
  /** The end of the promo's last day, in UTC — rendered as a date, never a time. */
  expiresAt: string | null;
  merchant: string | null;
  /** The mail it was read out of: subject, sender and date, never a body. */
  subject: string | null;
  fromName: string | null;
  fromEmail: string;
  internalDate: string;
}

export interface PromoSuggestionsResponse {
  items: PromoSuggestion[];
}

/**
 * What a manual extraction answers with (#165) — the detections that now stand
 * for one message, having replaced whatever the last run left.
 *
 * `found` is the server's, not something to re-derive from the array: a run
 * that turned up nothing is a real answer and the one the button most needs to
 * report, since an empty result and a button that did nothing look identical.
 */
export interface ExtractPromosResult {
  promos: PromoSuggestion[];
  found: boolean;
}

/**
 * One saved promo, as the Promo Codes page's rows are (#162).
 *
 * `accountEmail` is a column and never a filter: the page is global, because a
 * promo code is used at a checkout and which mailbox it arrived in is trivia.
 * The copy of the mail the save took is deliberately not here — a list of
 * fields does not need every saved mail's HTML.
 */
export interface PromoListing {
  id: string;
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  code: string | null;
  discount: string;
  terms: string | null;
  /** The end of the promo's last day, in UTC — rendered as a date, never a time. */
  expiresAt: string | null;
  merchant: string | null;
  /** When it was saved; null on a suggestion. */
  savedAt: string | null;
  /**
   * The mail's subject, sender and date — from the save's copy on a saved row,
   * from the inbox row on a suggestion. Never a body.
   */
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  internalDate: string | null;
}

/**
 * The Promo Codes page's suggestions (#154) — every account's detections, with
 * no period and no cap, which is where the ones past the inbox section's six
 * cards are reachable. One row shape with the saved promos below them: the five
 * guesses and the mailbox are what a row of that table says either way.
 */
export interface SuggestedPromosResponse {
  items: PromoListing[];
}

/** The page's two saved sections, each already in the order it is read in. */
export interface SavedPromosPage {
  active: PromoListing[];
  expired: PromoListing[];
}

/**
 * What the save answered (#161). The promo is saved whatever this says — the
 * server writes it before it asks Gmail for anything — so `trashedThreadId` is
 * null when the mail is still in the mailbox and there is something left for
 * the user to do by hand.
 */
export interface SavePromoResult {
  ok: true;
  id: string;
  trashedThreadId: string | null;
}

/**
 * The mail a saved promo came from (#163) — the copy the save took, which is
 * the only version left once Gmail has purged the original it trashed.
 *
 * It is a record and nothing here edits it: only the extracted fields beside it
 * on the row are the model's guesses, and only those are corrigible.
 */
export interface SavedPromoMail {
  id: string;
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  internalDate: string | null;
  /** What the mail looked like; rendered when there is one. */
  bodyHtml: string | null;
  /** The stripped text, which is what the viewer falls back to. */
  bodyText: string | null;
}

/**
 * Correcting the five extracted fields (#164).
 *
 * A patch: a field this does not name is the field nobody edited, and `null`
 * clears a nullable one — which is what an emptied box means. Two of them
 * cannot be cleared and the server refuses a request that tries: `discount`,
 * the headline that makes a row a promo at all, and `code`, because #166
 * stopped writing a row without one, so emptying the box would make by hand a
 * shape the extraction no longer produces (#168). Both stay correctable.
 *
 * The expiry crosses as a calendar day (`YYYY-MM-DD`), never an instant: a
 * promo expires on a date, and the server is what turns the day into the stored
 * end-of-day value — the same function the extraction writes through.
 *
 * Nothing of the saved copy of the mail is here, and that is the rule rather
 * than an omission: the guesses are corrigible, the record is not, and a
 * request naming a field of it is answered 400 rather than quietly stripped.
 */
export interface PromoFieldsPatch {
  code?: string;
  discount?: string;
  terms?: string | null;
  expiresAt?: string | null;
  merchant?: string | null;
}

/** A promo's guesses as they now stand — what an edit is answered with. */
export interface EditedPromo {
  id: string;
  code: string | null;
  discount: string;
  terms: string | null;
  expiresAt: string | null;
  merchant: string | null;
}

// Imported rather than restated (#105): which providers exist, and which model
// each one serves, is one catalogue — `@miel/core/providerModels` is a leaf
// module, so this pulls in no db or env code.
export type { Provider } from "@miel/core/providerModels";
import type { Provider } from "@miel/core/providerModels";

export interface ModelSettings {
  triageModel: string;
  triageProvider: Provider;
  replyModel: string;
  replyProvider: Provider;
  // Quoted because the task is `promo-extract` (#156): the field name is
  // `${task}Model`, and both the settings service and the pickers index it with
  // exactly that template, so the hyphen has to survive into the field. Absent
  // here until #154, which is why the one task that runs on every sync was also
  // the one no picker could reach.
  "promo-extractModel": string;
  "promo-extractProvider": Provider;
}

export interface TriageBatchSettings {
  batchSize: number;
  batchConcurrency: number;
}

export interface ScheduleSettings {
  enabled: boolean;
  /** Minutes between automatic runs. Integer ≥ 1 (clamped server-side). */
  intervalMinutes: number;
  /** How far back each automatic run looks, e.g. "6h", "24h", "7d". */
  since: string;
}

export interface ScheduleStatus {
  enabled: boolean;
  /** Epoch ms of the last automatic run start, or null if none yet. */
  lastStartedAt: number | null;
  /** Epoch ms of the last automatic run finish, or null if none yet. */
  lastFinishedAt: number | null;
  /** Whether a sync is in flight right now (automatic or manual). */
  isRunning: boolean;
}

/**
 * The Google OAuth client the server signs into Gmail with (#120, A15): entered
 * in the app and stored in the database, or — as the fallback, never mixed with
 * a stored one — read from the three `GOOGLE_*` variables. The secret never
 * crosses the wire; a stored one is described by a masked hint.
 *
 * `GET /auth/google/config` and `GET /settings/google-oauth` both answer it.
 */
export interface GoogleOAuthConfigStatus {
  configured: boolean;
  /** The variable names that are unset, empty when `configured`. */
  missing: string[];
  /** Where the client in effect comes from, or null when there is none. */
  source: "database" | "environment" | null;
  /** Not a secret: it appears in every consent URL. */
  clientId: string | null;
  redirectUri: string | null;
  /** A masked hint of the stored secret; only for a database client. */
  secretHint: string | null;
  /** The redirect URI a local `bun dev` run registers. */
  devRedirectUri: string;
  /** The path every redirect URI must end in. */
  callbackPath: string;
  /** Connected accounts a *different* client would disconnect. */
  accountsToReconnect: number;
}

/** What `PUT` and `DELETE /settings/google-oauth` answer. */
export interface GoogleOAuthSaveResult extends GoogleOAuthConfigStatus {
  clientChanged: boolean;
  /** Mailboxes the change disconnected; each has to reconnect. */
  reconnectRequired: number;
}

/** `PUT /settings/google-oauth`: a secret left out keeps the stored one. */
export interface SaveGoogleOAuthInput {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}

/**
 * The local provider's credential (#109): stored in the app like a vendor key,
 * and nowhere else — the server does not read a token from its environment, so
 * "configured" is the whole answer and this has the shape every other
 * credential status has.
 */
export interface ClaudeCodeTokenStatus {
  configured: boolean;
  /** A masked hint (`sk-ant-…3f9`), or null when there is no token to hint at. */
  hint: string | null;
}

/**
 * The LLM vendors miel can hold an API key for: every provider except the local
 * CLI, which authenticates with a token of its own instead.
 */
export type CredentialProvider = Exclude<Provider, "claude-code">;

/**
 * Everything the browser is allowed to know about a stored provider key: that
 * there is one, and just enough of it to recognise which (`sk-ant-…3f9`). The
 * key itself never crosses this boundary in either direction except as the body
 * of the PUT that sets it.
 */
export interface ProviderCredentialStatus {
  provider: CredentialProvider;
  configured: boolean;
  hint: string | null;
}

/** Presence + masked hint for a stored secret, with no vendor attached. */
export interface SecretStatus {
  configured: boolean;
  hint: string | null;
}

/**
 * One proxy header as the server is willing to describe it: the name in full,
 * the value masked. Names are shown because a mistyped one only fails when a
 * relay runs, so seeing exactly what will be sent is how a typo gets caught.
 */
export interface MaskedHeader {
  name: string;
  valueHint: string;
}

/**
 * The worp relay's configuration (#107). The base URL is not a secret and
 * arrives in the clear; the key and the header values never do.
 *
 * `configured` is the server's own gate — worp is off until base URL and key
 * are both set — sent rather than recomputed here so the UI cannot disagree
 * with what the relay will actually do.
 */
export interface WorpSettings {
  baseUrl: string;
  apiKey: SecretStatus;
  extraHeaders: MaskedHeader[];
  configured: boolean;
}

/**
 * A patch. An omitted field is left as stored — which is what lets the base URL
 * be saved without re-sending a key the browser never had. `apiKey: null`
 * clears the key.
 *
 * `extraHeaders` is a patch of its own for the same reason (#119): a name
 * mapped to a string sets that header, to null removes it, and a stored header
 * it does not mention is left alone. The map is cleared by naming every header
 * null.
 */
export interface WorpSettingsPatch {
  baseUrl?: string;
  apiKey?: string | null;
  extraHeaders?: Record<string, string | null>;
}

export type RunTrigger = "manual" | "automatic";
export type RunStatus = "running" | "completed" | "failed";

interface LogEntryBase {
  id: string;
  accountId: string;
  accountEmail: string | null;
  trigger: RunTrigger;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface SyncLogEntry extends LogEntryBase {
  type: "sync";
  messagesFetched: number;
  messagesNew: number;
  rangeFrom: string;
  rangeTo: string;
}

export interface TriageLogEntry extends LogEntryBase {
  type: "triage";
  candidates: number;
  triaged: number;
  failedBatches: number;
  syncWindowId: string | null;
}

export type LogEntry = SyncLogEntry | TriageLogEntry;

export interface LogsResponse {
  entries: LogEntry[];
}

export type ScheduledSendStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";

/**
 * A message miel holds and sends itself at `sendAt` (A12) — Gmail's API has no
 * scheduled send. `GET /compose/scheduled` lists the pending, sending and failed
 * ones, soonest first; `error` is the reason a failed one gave up.
 */
export interface ScheduledSendView {
  id: string;
  accountId: string;
  kind: "new" | "reply" | "forward";
  sourceGmailMessageId: string | null;
  sendAt: string;
  status: ScheduledSendStatus;
  attempts: number;
  error: string | null;
  sentAt: string | null;
  sentMessageId: string | null;
  threadId: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  /** The body's first line, at most 140 characters. */
  preview: string;
  attachmentCount: number;
  createdAt: string;
}

export interface ScheduledSendsResponse {
  items: ScheduledSendView[];
}
