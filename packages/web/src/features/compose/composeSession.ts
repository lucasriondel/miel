import type { MessageDetail } from "../../api/types";
import { forwardBody, forwardSubject, knownNames, replySubject } from "../reply/replyDefaults";

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

const EMPTY_FIELDS: ComposeFields = {
  to: [],
  cc: [],
  bcc: [],
  showCc: false,
  showBcc: false,
  subject: "",
  body: "",
  prompt: "",
};

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
  fields: { ...EMPTY_FIELDS },
  intent: "open",
  focusInstruction: false,
});

/** The prefilled fields of each way to answer `message`. Never the body of a reply. */
export const replyFields = (message: MessageDetail, mode: ReplyMode): ComposeFields => {
  if (mode === "forward") {
    return {
      ...EMPTY_FIELDS,
      subject: forwardSubject(message.subject),
      body: forwardBody(message),
    };
  }
  const cc = mode === "replyAll" ? [...message.replyAllCc] : [];
  return {
    ...EMPTY_FIELDS,
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
  fields.prompt.trim().length === 0;

/** The title bar's line: the subject as typed, else what the window is. */
export const sessionTitle = (session: ComposeSession): string => {
  const subject = session.fields.subject.trim();
  if (subject.length > 0) return subject;
  if (session.kind === "new") return "New message";
  return session.message?.subject?.trim() || "(no subject)";
};

/** How many windows the dock holds at once. */
export const MAX_WINDOWS = 3;
