export interface Account {
  id: string;
  email: string;
  displayName: string | null;
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

export interface PendingExistingLabelSuggestion {
  labelId: string;
  name: string;
  colorBg: string | null;
  colorFg: string | null;
}

export interface PendingNewLabelSuggestion {
  suggestionId: string;
  name: string;
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
  pendingSuggestions: {
    existing: PendingExistingLabelSuggestion[];
    new: PendingNewLabelSuggestion[];
  };
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
  latestTriageId: string | null;
  triageHistory: {
    id: string;
    priority: Priority;
    reasoning: string;
    model: string | null;
    createdAt: string;
    existingLabelSuggestions: {
      labelId: string;
      name: string;
      colorBg: string | null;
      colorFg: string | null;
      status: "pending" | "applied" | "dismissed";
    }[];
    newLabelSuggestions: {
      suggestionId: string;
      name: string;
      reasoning: string | null;
      status: "pending" | "applied" | "dismissed";
    }[];
  }[];
}

export interface SyncRunResult {
  account: string;
  fetched: number;
  triaged: number;
  suggestedNewLabels: number;
  filtersSynced: number;
  suggestedFilters: number;
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

export interface SuggestedFilter {
  id: string;
  accountId: string;
  accountEmail: string;
  criteriaFrom: string | null;
  criteriaSubject: string | null;
  criteriaQuery: string | null;
  addLabelId: string | null;
  addLabelName: string;
  reasoning: string | null;
  status: "pending" | "accepted" | "dismissed";
  createdAt: string;
}

export interface FiltersResponse {
  filters: GmailFilter[];
  suggestions: SuggestedFilter[];
}

export interface SuggestFilterForMessageResult {
  suggestion: SuggestedFilter | null;
  created: boolean;
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
  filterModel: string;
  filterProvider: Provider;
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
 * Whether the server can talk to Google at all (#120): the three `GOOGLE_*`
 * variables are environment, not a runtime setting, so this is the one piece of
 * onboarding the app can report but not fix. Names only — no values ever cross
 * the wire, one of the three being a client secret.
 */
export interface GoogleOAuthConfigStatus {
  configured: boolean;
  /** The variable names that are unset, empty when `configured`. */
  missing: string[];
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
  suggestedNewLabels: number;
  failedBatches: number;
  syncWindowId: string | null;
}

export type LogEntry = SyncLogEntry | TriageLogEntry;

export interface LogsResponse {
  entries: LogEntry[];
}
