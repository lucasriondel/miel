import type { GmailDataAdapter } from "../../google/gmailAdapter";
import type { ClaudeImpl } from "../../claude/Claude";
import type { SyncServerEventT } from "../../schemas/syncEvents";
import type { DateRange } from "../../util/time";

export type RunTrigger = "manual" | "automatic";

export interface SyncRunResult {
  account: string;
  fetched: number;
  triaged: number;
  suggestedNewLabels: number;
  filtersSynced: number;
  suggestedFilters: number;
  errors: string[];
}

export interface NormalizedAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface NormalizedMessage {
  accountId: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string | null;
  snippet: string | null;
  bodyText: string;
  bodyHtml: string;
  internalDate: Date;
  rawHeaders: Record<string, string>;
  labelIds: string[];
  attachments: NormalizedAttachment[];
}

export interface FetchAndTriageOptions {
  accountEmail: string;
  since?: string;
  range?: DateRange;
  max?: number;
  gmail?: GmailDataAdapter;
  claude?: ClaudeImpl;
  log?: (msg: string) => void;
  onEvent?: (event: SyncServerEventT) => void;
  triage?: boolean;
  trigger?: RunTrigger;
}

export interface SyncAllOptions {
  accountEmail?: string;
  since?: string;
  range?: DateRange;
  max?: number;
  gmail?: GmailDataAdapter;
  claude?: ClaudeImpl;
  log?: (msg: string) => void;
  onEvent?: (event: SyncServerEventT) => void;
  triage?: boolean;
  trigger?: RunTrigger;
}

export interface TriageUntriagedOptions {
  accountEmail: string;
  claude?: ClaudeImpl;
  log?: (msg: string) => void;
  onEvent?: (event: SyncServerEventT) => void;
  trigger?: RunTrigger;
}

export interface TriageUntriagedResult {
  account: string;
  candidates: number;
  triaged: number;
  suggestedNewLabels: number;
  errors: string[];
}
