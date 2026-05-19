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
}

export type Priority = "high" | "medium" | "low";

export interface MessageLabel {
  id: string;
  name: string;
  gmailLabelId: string;
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
  errors: string[];
}

export interface SyncResponse {
  runs: SyncRunResult[];
}

export interface ModelSettings {
  triageModel: string;
  replyModel: string;
}
