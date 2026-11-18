/**
 * Service contracts for the direct-Google-API backend.
 *
 * Each Gmail REST resource is its own `Context.Service` (messages, labels,
 * filters, threads, modify, profile) so a consumer depends on exactly what it
 * uses and each is independently mockable. `GoogleAuth` is the only service that
 * touches the DB + OAuth2Client; every Gmail service depends on it (its methods
 * carry `GoogleAuth` in the `R` channel) to resolve an `AccountRef` into an
 * authed client. Live implementations live in sibling files; tests provide fake
 * layers satisfying the same Tags.
 *
 * Modeled on worp `src/lib/services/contracts.ts`.
 */
import { Context, Effect } from "effect";
import type { OAuth2Client } from "google-auth-library";
import type { GogFilterT, GogLabelT, GogMessageRawT } from "../schemas/gmail";
import type { MimeAttachment } from "./rfc822";
import type {
  AccountNotConnectedError,
  GmailApiError,
  GmailAuthError,
  GmailFilterError,
  GmailLabelError,
  GmailParseError,
  GmailSendError,
  OAuthConfigError,
  OAuthExchangeError,
  TokenRefreshError,
} from "../errors";

/** Identifies which connected account a Gmail call acts on. */
export type AccountRef = { accountId: string } | { email: string };

/** Stable string key for an AccountRef (for error payloads / logging). */
export function refKey(ref: AccountRef): string {
  return "accountId" in ref ? `id:${ref.accountId}` : `email:${ref.email}`;
}

export interface SearchHit {
  messageId: string;
  threadId: string;
}

export interface SendResult {
  messageId: string;
  /**
   * The thread Gmail filed the sent message in — the reply's own thread, or a
   * new one for a new message. Enough for a client to link to it in Gmail.
   */
  threadId: string;
}

/**
 * One outgoing message, reply or new. The threading fields are what make
 * the difference: a reply names the thread and the original's Message-ID, a new
 * message names neither and Gmail starts a thread for it.
 */
export interface SendMessageInput {
  to: string[];
  /** Carbon copy, as edited in the compose window (#96). Absent = no Cc header. */
  cc?: string[];
  /** Blind copy; Gmail delivers to it and strips the header from what others see. */
  bcc?: string[];
  subject: string;
  body: string;
  /** An HTML alternative of the body (a quoted HTML original rides here). */
  html?: string;
  /** The From header, formatted; absent is the account's own address. */
  from?: string;
  /** Files to attach; any at all sends the message as `multipart/mixed`. */
  attachments?: MimeAttachment[];
  /** A Message-ID of miel's own (scheduled sends), instead of Gmail's. */
  messageId?: string;
  /** The message being replied to — drives In-Reply-To/References + threadId. */
  replyToMessageId?: string;
  /** Gmail thread to attach the message to (keeps a reply in-thread). */
  threadId?: string;
  /** Message-ID header of the original, for In-Reply-To/References. */
  inReplyToHeader?: string;
}

/** The pre-compose name, kept for the callers that only ever send replies. */
export type SendReplyInput = SendMessageInput;

/** A draft as Gmail stores it: its own id, plus the message it wraps. */
export interface SavedDraft {
  draftId: string;
  messageId: string;
  threadId: string;
}

export interface FilterSpec {
  from?: string;
  to?: string;
  subject?: string;
  query?: string;
  /** Existing Gmail label id to add when the filter matches. */
  addLabelId?: string;
  /** Label ids to add; takes precedence over `addLabelId` when both are set. */
  addLabelIds?: string[];
  /** Label ids to remove — how Gmail models archive / mark-read / not-spam. */
  removeLabelIds?: string[];
  /** Address to forward matches to. Gmail allows at most one. */
  forward?: string;
}

export interface AccountProfile {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface TokenGrant {
  refreshToken: string;
  scopes: string[];
  accessToken: string;
}

// ── GoogleAuth ──────────────────────────────────────────────────────────────

export interface GoogleAuthImpl {
  /** Authed OAuth2 client for the account, with a freshly-forced access token. */
  readonly clientFor: (
    ref: AccountRef,
  ) => Effect.Effect<OAuth2Client, AccountNotConnectedError | TokenRefreshError>;
  /** Consent URL for the "Connect with Google" button (no account yet). */
  readonly consentUrl: (state: string) => Effect.Effect<string, OAuthConfigError>;
  /** Exchange the callback `?code=` for tokens (refresh token + scopes). */
  readonly exchangeCode: (
    code: string,
  ) => Effect.Effect<TokenGrant, OAuthConfigError | OAuthExchangeError>;
  /** Profile (email/name/avatar) from a just-minted access token, no DB read. */
  readonly profileFromToken: (accessToken: string) => Effect.Effect<AccountProfile, GmailApiError>;
}

export class GoogleAuth extends Context.Service<GoogleAuth, GoogleAuthImpl>()("GoogleAuth") {}

// ── Gmail resource services ─────────────────────────────────────────────────

export interface AttachmentBytes {
  data: Uint8Array;
  size: number;
}

/** A message's headers, without its body — `messages.get(format=metadata)`. */
export interface MessageMetadata {
  id: string;
  threadId: string;
  internalDate: Date;
  /** Lowercased header names. */
  headers: Record<string, string>;
}

/** One address the account may send as — `users.settings.sendAs`. */
export interface SendAsAlias {
  email: string;
  displayName: string | null;
  /** The account's own address. */
  isPrimary: boolean;
  /** Gmail's default From. */
  isDefault: boolean;
  /** Only an accepted alias can be sent from; Gmail rewrites any other From. */
  verified: boolean;
}

export interface GmailMessagesImpl {
  readonly search: (
    ref: AccountRef,
    query: string,
    max?: number,
  ) => Effect.Effect<
    SearchHit[],
    GmailAuthError | GmailApiError | GmailParseError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
  readonly get: (
    ref: AccountRef,
    messageId: string,
  ) => Effect.Effect<
    GogMessageRawT,
    GmailAuthError | GmailApiError | GmailParseError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
  readonly send: (
    ref: AccountRef,
    msg: SendMessageInput,
  ) => Effect.Effect<
    SendResult,
    GmailAuthError | GmailSendError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
  readonly getAttachment: (
    ref: AccountRef,
    messageId: string,
    attachmentId: string,
  ) => Effect.Effect<
    AttachmentBytes,
    GmailAuthError | GmailApiError | GmailParseError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
  /** The named headers of one message, and nothing of its body. */
  readonly metadata: (
    ref: AccountRef,
    messageId: string,
    headerNames: readonly string[],
  ) => Effect.Effect<
    MessageMetadata,
    GmailAuthError | GmailApiError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
}

export class GmailMessages extends Context.Service<GmailMessages, GmailMessagesImpl>()(
  "GmailMessages",
) {}

export interface GmailLabelsImpl {
  readonly list: (
    ref: AccountRef,
  ) => Effect.Effect<
    GogLabelT[],
    GmailAuthError | GmailApiError | GmailParseError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
  readonly create: (
    ref: AccountRef,
    name: string,
  ) => Effect.Effect<
    GogLabelT,
    GmailAuthError | GmailLabelError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
}

export class GmailLabels extends Context.Service<GmailLabels, GmailLabelsImpl>()("GmailLabels") {}

export interface GmailFiltersImpl {
  readonly list: (
    ref: AccountRef,
  ) => Effect.Effect<
    GogFilterT[],
    GmailAuthError | GmailApiError | GmailParseError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
  readonly create: (
    ref: AccountRef,
    spec: FilterSpec,
  ) => Effect.Effect<
    GogFilterT,
    GmailAuthError | GmailFilterError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
  /** Delete one filter by its Gmail filter id. Not reversible in Gmail. */
  readonly delete: (
    ref: AccountRef,
    filterId: string,
  ) => Effect.Effect<
    void,
    GmailAuthError | GmailFilterError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
}

export class GmailFilters extends Context.Service<GmailFilters, GmailFiltersImpl>()(
  "GmailFilters",
) {}

export interface GmailThreadsImpl {
  readonly trash: (
    ref: AccountRef,
    threadId: string,
  ) => Effect.Effect<
    void,
    GmailAuthError | GmailApiError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
  readonly archive: (
    ref: AccountRef,
    threadId: string,
  ) => Effect.Effect<
    void,
    GmailAuthError | GmailApiError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
  /** Archive's undo: put INBOX back on the thread. */
  readonly unarchive: (
    ref: AccountRef,
    threadId: string,
  ) => Effect.Effect<
    void,
    GmailAuthError | GmailApiError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
  /** Trash's undo: TRASH off, INBOX back on — the exact inverse of `trash`. */
  readonly untrash: (
    ref: AccountRef,
    threadId: string,
  ) => Effect.Effect<
    void,
    GmailAuthError | GmailApiError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
}

export class GmailThreads extends Context.Service<GmailThreads, GmailThreadsImpl>()(
  "GmailThreads",
) {}

export interface GmailModifyImpl {
  readonly batch: (
    ref: AccountRef,
    messageIds: string[],
    add?: string[],
    remove?: string[],
  ) => Effect.Effect<
    void,
    GmailAuthError | GmailApiError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
}

/**
 * `users.drafts.*` — the compose window's autosave. Covered by `gmail.modify`,
 * so it costs no new scope and no re-consent.
 */
export interface GmailDraftsImpl {
  /** Create a draft, or replace the one `draftId` names. */
  readonly save: (
    ref: AccountRef,
    draft: { draftId?: string; message: SendMessageInput },
  ) => Effect.Effect<
    SavedDraft,
    GmailAuthError | GmailApiError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
  /** Delete a draft for good (Gmail drafts have no trash). */
  readonly delete: (
    ref: AccountRef,
    draftId: string,
  ) => Effect.Effect<
    void,
    GmailAuthError | GmailApiError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
}

export class GmailDrafts extends Context.Service<GmailDrafts, GmailDraftsImpl>()("GmailDrafts") {}

export class GmailModify extends Context.Service<GmailModify, GmailModifyImpl>()("GmailModify") {}

export interface GmailProfileImpl {
  readonly profile: (
    ref: AccountRef,
  ) => Effect.Effect<
    AccountProfile,
    GmailAuthError | GmailApiError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
  /**
   * The addresses the account may send as (`users.settings.sendAs.list`) —
   * covered by `gmail.settings.basic`, a scope every account already granted.
   */
  readonly sendAs: (
    ref: AccountRef,
  ) => Effect.Effect<
    SendAsAlias[],
    GmailAuthError | GmailApiError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
}

export class GmailProfile extends Context.Service<GmailProfile, GmailProfileImpl>()(
  "GmailProfile",
) {}
