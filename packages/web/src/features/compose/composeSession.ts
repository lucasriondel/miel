import type { MessageDetail } from "../../api/types";
import { forwardSubject, knownNames, replySubject } from "../reply/replyDefaults";

/**
 * One compose window's worth of state, as the provider holds it (the redesign's
 * "up to three docked" windows).
 *
 * Pure and window-agnostic: the window renders whatever session it is handed,
 * and what a reply, a reply-all or a forward is prefilled with is decided here
 * — the window itself still knows nothing about a message being answered.
 */
export type ReplyMode = "reply" | "replyAll" | "forward";

/** What a window is: a new mail, or one of the three ways of answering a message. */
export type ComposeKind = "new" | ReplyMode;

export interface ComposeFields {
  to: string[];
  cc: string[];
  bcc: string[];
  /** Cc and Bcc rows are folded until asked for, or until they hold someone. */
  showCc: boolean;
  showBcc: boolean;
  subject: string;
  body: string;
  /** The instruction for the AI, as typed in the strip. */
  prompt: string;
  /**
   * The mailbox it goes from: the session's own account unless the From menu
   * picked another connected one (a new mail, or a reply sent from elsewhere).
   */
  fromAccountId: string;
  /** A verified send-as alias of that mailbox; null sends as the mailbox itself. */
  fromAlias: string | null;
  /** Files the user attached, in the order their chips are drawn. */
  uploads: UploadChip[];
  /** A forward's original files whose chips were removed: not carried. */
  droppedAttachmentIds: string[];
  /**
   * A reply's quote as the user trimmed it, or null while untouched — the
   * server then quotes the stored original as it is.
   */
  quotedText: string | null;
  /** The Gmail draft the window autosaves into, once one exists. */
  draftId: string | null;
  /** Names picked suggestions carried, so their chips say who rather than an address. */
  contactNames: Record<string, string>;
}

/**
 * One attached file. The bytes stay in the window (they are what a retry or a
 * change of mailbox uploads again); this is what the chip shows and what a
 * send names.
 */
export interface UploadChip {
  key: string;
  filename: string;
  size: number;
  mimeType: string;
  status: "uploading" | "ready" | "failed";
  /** 0–1 while uploading. */
  progress: number;
  /** The staged upload's id, once the server has it. */
  uploadId: string | null;
  /** Which mailbox it was staged for: an upload belongs to one account. */
  uploadedFor: string | null;
  /** Why the server refused it ("48.0 MB — over Gmail's 25 MB."). */
  error: string | null;
}

export interface ComposeSession {
  id: string;
  kind: ComposeKind;
  accountId: string;
  /** The From row: the mailbox it sends from, which is not switchable. */
  accountEmail: string;
  accountName: string | null;
  /** The message answered or forwarded; null for a new mail. */
  message: MessageDetail | null;
  /** Display names the chips can show for addresses the message knows. */
  names: Record<string, string>;
  fields: ComposeFields;
  intent: "open" | "minimized";
  /** Set when the window was opened to draft with the AI: the caret lands in the strip. */
  focusInstruction: boolean;
}

export interface ComposeAccount {
  id: string;
  email: string;
  displayName: string | null;
}

const emptyFields = (accountId: string): ComposeFields => ({
  to: [],
  cc: [],
  bcc: [],
  showCc: false,
  showBcc: false,
  subject: "",
  body: "",
  prompt: "",
  fromAccountId: accountId,
  fromAlias: null,
  uploads: [],
  droppedAttachmentIds: [],
  quotedText: null,
  draftId: null,
  contactNames: {},
});

let counter = 0;
const nextId = () => `compose-${Date.now().toString(36)}-${(counter += 1)}`;

export const newSession = (account: ComposeAccount): ComposeSession => ({
  id: nextId(),
  kind: "new",
  accountId: account.id,
  accountEmail: account.email,
  accountName: account.displayName,
  message: null,
  names: {},
  fields: emptyFields(account.id),
  intent: "open",
  focusInstruction: false,
});

/**
 * The prefilled fields of each way to answer `message`. Never a body: the
 * quote under a reply and the block under a forward are the server's, drawn
 * below the body rather than typed into it.
 */
export const replyFields = (message: MessageDetail, mode: ReplyMode): ComposeFields => {
  const empty = emptyFields(message.accountId);
  if (mode === "forward") {
    return { ...empty, subject: forwardSubject(message.subject) };
  }
  const cc = mode === "replyAll" ? [...message.replyAllCc] : [];
  return {
    ...empty,
    to: message.fromEmail ? [message.fromEmail] : [],
    cc,
    showCc: cc.length > 0,
    subject: replySubject(message.subject),
  };
};

export interface ReplyPrefill {
  /** A body to open with — the reader's drafted reply, handed over by its Edit. */
  body?: string;
  /** The instruction that body was drafted from, kept so Regenerate can reuse it. */
  prompt?: string;
  /** Open with the caret in the AI strip (Draft reply with AI, ⇧R). */
  focusInstruction?: boolean;
}

export const replySession = (
  message: MessageDetail,
  mode: ReplyMode,
  account: ComposeAccount | null,
  prefill: ReplyPrefill = {},
): ComposeSession => {
  const fields = replyFields(message, mode);
  return {
    id: nextId(),
    kind: mode,
    accountId: message.accountId,
    accountEmail: account?.email ?? message.accountEmail,
    accountName: account?.displayName ?? null,
    message,
    names: knownNames(message),
    fields: {
      ...fields,
      body: prefill.body ?? fields.body,
      prompt: prefill.prompt ?? "",
    },
    intent: "open",
    focusInstruction: prefill.focusInstruction ?? false,
  };
};

/** Nothing typed and nothing addressed: a window `C` may reuse rather than stack. */
export const isBlank = (fields: ComposeFields): boolean =>
  fields.to.length === 0 &&
  fields.cc.length === 0 &&
  fields.bcc.length === 0 &&
  fields.subject.trim().length === 0 &&
  fields.body.trim().length === 0 &&
  fields.prompt.trim().length === 0 &&
  fields.uploads.length === 0;

/** The title bar's line: the subject as typed, else what the window is. */
export const sessionTitle = (session: ComposeSession): string => {
  const subject = session.fields.subject.trim();
  if (subject.length > 0) return subject;
  if (session.kind === "new") return "New message";
  return session.message?.subject?.trim() || "(no subject)";
};

/** How many windows the dock holds at once. */
export const MAX_WINDOWS = 3;
