/**
 * Service contracts for the direct-Google-API backend.
 *
 * Each Gmail REST resource is its own `Context.Tag` service (messages, labels,
 * filters, threads, modify, profile) so a consumer depends on exactly what it
 * uses and each is independently mockable. `GoogleAuth` is the only service that
 * touches the DB + OAuth2Client; every Gmail service depends on it (its methods
 * carry `GoogleAuth` in the `R` channel) to resolve an `AccountRef` into an
 * authed client. Live implementations live in sibling files; tests provide fake
 * layers satisfying the same Tags.
 *
 * Modeled on worp `src/lib/services/contracts.ts`.
 */
import { Effect } from "effect";
import type { OAuth2Client } from "google-auth-library";
import type { GogFilterT, GogLabelT, GogMessageRawT } from "../schemas/gmail";
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
}

export interface SendReplyInput {
  to: string[];
  /** Carbon copy, as edited in the compose window (#96). Absent = no Cc header. */
  cc?: string[];
  subject: string;
  body: string;
  /** The message being replied to — drives In-Reply-To/References + threadId. */
  replyToMessageId: string;
  /** Gmail thread to attach the reply to (keeps it in-thread). */
  threadId: string;
  /** Message-ID header of the original, for In-Reply-To/References. */
  inReplyToHeader?: string;
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

export class GoogleAuth extends Effect.Tag("GoogleAuth")<GoogleAuth, GoogleAuthImpl>() {}

// ── Gmail resource services ─────────────────────────────────────────────────

export interface AttachmentBytes {
  data: Uint8Array;
  size: number;
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
    msg: SendReplyInput,
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
}

export class GmailMessages extends Effect.Tag("GmailMessages")<
  GmailMessages,
  GmailMessagesImpl
>() {}

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

export class GmailLabels extends Effect.Tag("GmailLabels")<GmailLabels, GmailLabelsImpl>() {}

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

export class GmailFilters extends Effect.Tag("GmailFilters")<GmailFilters, GmailFiltersImpl>() {}

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
}

export class GmailThreads extends Effect.Tag("GmailThreads")<GmailThreads, GmailThreadsImpl>() {}

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

export class GmailModify extends Effect.Tag("GmailModify")<GmailModify, GmailModifyImpl>() {}

export interface GmailProfileImpl {
  readonly profile: (
    ref: AccountRef,
  ) => Effect.Effect<
    AccountProfile,
    GmailAuthError | GmailApiError | TokenRefreshError | AccountNotConnectedError,
    GoogleAuth
  >;
}

export class GmailProfile extends Effect.Tag("GmailProfile")<GmailProfile, GmailProfileImpl>() {}
