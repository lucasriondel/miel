/**
 * The parts every outgoing message — new, reply, forward, draft or scheduled —
 * resolves the same way before Gmail is asked anything: who it is From, which
 * files ride with it, whether they fit, and who it reached once it went.
 *
 * Every refusal here is a `ComposeRefusedError`, raised before the send, so a
 * refused request has sent nothing.
 */
import { Effect } from "effect";
import { MAX_ATTACHMENTS_BYTES } from "../composeLimits";
import { ComposeRefusedError } from "../errors";
import type { GmailDataAdapter } from "../google/gmailAdapter";
import { formatAddress, type MimeAttachment } from "../google/rfc822";
import {
  ContactStore,
  MessageStore,
  OutboxStore,
  type StoredAccount,
  type StoredMessage,
} from "../stores/contracts";
import { createDebug } from "../util/debug";
import { parseFromHeader } from "../util/gmailPayload";
import { tryAsync } from "../util/effect";

const debug = createDebug("service:outgoing");

const refuse = (reason: ComposeRefusedError["reason"], message: string) =>
  Effect.fail(new ComposeRefusedError({ reason, message }));

/** Trimmed and blank-free; an address list the sender typed, cleaned. */
export const cleanList = (list: readonly string[] | undefined): string[] =>
  (list ?? []).map((a) => a.trim()).filter((a) => a.length > 0);

/** Which account is writing, named either way round (the API by id, the CLI by email). */
export interface AccountArgs {
  accountId?: string;
  accountEmail?: string;
}

export const resolveAccountEffect = (
  args: AccountArgs,
): Effect.Effect<StoredAccount, ComposeRefusedError, MessageStore> =>
  Effect.gen(function* () {
    const { accountId, accountEmail } = args;
    const account = accountId
      ? yield* MessageStore.use((svc) => svc.accountById(accountId))
      : accountEmail
        ? yield* MessageStore.use((svc) => svc.accountByEmail(accountEmail))
        : null;
    if (!account) {
      return yield* refuse(
        "account_not_found",
        `Account not found: ${accountId ?? accountEmail ?? "(none named)"}`,
      );
    }
    return account;
  });

export const resolveMessageEffect = (
  args: AccountArgs & { gmailMessageId: string },
): Effect.Effect<StoredMessage, ComposeRefusedError, MessageStore> =>
  Effect.gen(function* () {
    const account = yield* resolveAccountEffect(args);
    const msg = yield* MessageStore.use((svc) =>
      svc.detail({ accountId: account.id, gmailMessageId: args.gmailMessageId }),
    );
    if (!msg) {
      return yield* refuse("message_not_found", `Message not found: ${args.gmailMessageId}`);
    }
    return msg;
  });

/**
 * The From header for a send-as alias, or undefined for the account's own
 * default. Only an alias Gmail lists as accepted for this account is allowed:
 * Gmail would otherwise rewrite the header to the account's own address, and
 * the user would have sent from somewhere they did not choose.
 */
export const resolveFromEffect = (args: {
  gmail: GmailDataAdapter;
  accountEmail: string;
  from?: string;
}): Effect.Effect<string | undefined, ComposeRefusedError | Error> =>
  Effect.gen(function* () {
    const wanted = args.from?.trim().toLowerCase();
    if (!wanted) return undefined;
    const aliases = yield* tryAsync(() => args.gmail.listSendAs({ account: args.accountEmail }));
    const alias = aliases.find((a) => a.email.toLowerCase() === wanted && a.verified);
    if (!alias) {
      return yield* refuse(
        "send_as_not_allowed",
        `${args.from} is not an address ${args.accountEmail} can send as.`,
      );
    }
    return formatAddress(alias.email, alias.displayName);
  });

/** The account's uploads by id, as attachments; an id that is not its own is refused. */
export const loadUploadsEffect = (args: {
  accountId: string;
  uploadIds: readonly string[] | undefined;
}): Effect.Effect<MimeAttachment[], ComposeRefusedError, OutboxStore> =>
  Effect.gen(function* () {
    const ids = [...new Set(args.uploadIds ?? [])];
    if (ids.length === 0) return [];
    const rows = yield* OutboxStore.use((svc) =>
      svc.uploadsByIds({ accountId: args.accountId, ids }),
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      return yield* refuse("upload_not_found", `Upload not found: ${missing.join(", ")}`);
    }
    // The order the caller named them in, which is the order of the chips.
    return ids.map((id) => {
      const row = byId.get(id)!;
      return { filename: row.filename, mimeType: row.mimeType, data: row.data };
    });
  });

/**
 * A forward's kept attachments, fetched from Gmail: the original's own files,
 * named by Gmail attachment id. Absent `keep` keeps them all — the design's
 * forward "carries the attachments" and a removed chip is simply not named.
 */
export const loadForwardedAttachmentsEffect = (args: {
  gmail: GmailDataAdapter;
  source: StoredMessage;
  keep?: readonly string[];
}): Effect.Effect<MimeAttachment[], ComposeRefusedError | Error, MessageStore> =>
  Effect.gen(function* () {
    const stored = yield* MessageStore.use((svc) =>
      svc.attachmentsFor([
        { accountId: args.source.accountId, gmailMessageId: args.source.gmailMessageId },
      ]),
    );
    const keep = args.keep === undefined ? stored.map((a) => a.attachmentId) : [...args.keep];
    const byId = new Map(stored.map((a) => [a.attachmentId, a]));
    const missing = keep.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      return yield* refuse(
        "attachment_not_found",
        `The original carries no attachment ${missing.join(", ")}`,
      );
    }
    return yield* Effect.forEach(
      keep,
      (attachmentId) =>
        Effect.map(
          tryAsync(() =>
            args.gmail.getAttachment({
              account: args.source.accountEmail,
              messageId: args.source.gmailMessageId,
              attachmentId,
            }),
          ),
          (bytes): MimeAttachment => {
            const meta = byId.get(attachmentId)!;
            return { filename: meta.filename, mimeType: meta.mimeType, data: bytes.data };
          },
        ),
      { concurrency: 3 },
    );
  });

/** Refuse a set of files larger than Gmail will take ({@link MAX_ATTACHMENTS_BYTES}). */
export const checkAttachmentSizeEffect = (
  files: readonly { data: Uint8Array }[],
): Effect.Effect<void, ComposeRefusedError> => {
  const total = files.reduce((sum, f) => sum + f.data.byteLength, 0);
  return total > MAX_ATTACHMENTS_BYTES
    ? refuse(
        "attachment_too_large",
        `Attachments add up to ${(total / 1024 / 1024).toFixed(1)} MB — over Gmail's 25 MB.`,
      )
    : Effect.void;
};

/**
 * Note who a sent message reached, for the address suggestions. Best-effort:
 * the mail is out, so a store failure here is logged and swallowed rather than
 * reported as a failed send.
 */
export const recordRecipientsEffect = (args: {
  accountId: string;
  accountEmail: string;
  addresses: readonly string[];
  at: Date;
}): Effect.Effect<void, never, ContactStore> => {
  const own = args.accountEmail.toLowerCase();
  const sightings = args.addresses
    .map((raw) => parseFromHeader(raw))
    .filter((p) => p.email.includes("@") && p.email.toLowerCase() !== own)
    .map((p) => ({
      accountId: args.accountId,
      email: p.email,
      name: p.name,
      contactedAt: args.at,
    }));
  if (sightings.length === 0) return Effect.void;
  return ContactStore.use((svc) => svc.record(sightings)).pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() => debug.warn("recipients not recorded", { cause: String(cause) })),
    ),
  );
};
