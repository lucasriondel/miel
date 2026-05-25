export interface Account {
  id: string;
  email: string;
  displayName: string | null;
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

export interface ModelSettings {
  triageModel: string;
  replyModel: string;
  filterModel: string;
}

export interface ClaudeAuthStatus {
  loggedIn: boolean;
  authMethod?: string;
  email?: string;
}

export interface StartClaudeLoginResult {
  sessionId: string;
  url: string;
}
