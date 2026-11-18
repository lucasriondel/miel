/**
 * Schedule send: hold a message and send it at a chosen time.
 *
 * Gmail's REST API cannot do this — Gmail's own scheduled send is a web-client
 * feature with no endpoint — so the design's "Schedule send hands Gmail a time"
 * is implemented by miel holding the message (`scheduled_sends`) and the API
 * process's due-work loop (`dueWork.ts`) sending it when it is due, through the
 * very same send services an immediate send uses. Consequences worth stating:
 *
 * - It sends only while the API runs. A send that fell due while it was down
 *   goes out on the first tick after it comes back.
 * - It survives a restart, because the row is the state.
 * - It is at-least-once with a double-send guard. A tick claims a row atomically
 *   (so two ticks, or two API processes, never both send it); a row left
 *   `sending` by a process that died mid-send is reclaimed after
 *   {@link STALE_CLAIM_MS}, and before it is sent again Gmail is searched for the
 *   Message-ID miel wrote into it — if the first attempt landed, the send is
 *   recorded rather than repeated.
 * - The message is stored as the send request, not as MIME: a reply is threaded
 *   and quoted, a forward's attachments fetched, at the moment it goes.
 */
import { Effect } from "effect";
import { createGmailAdapter, type GmailDataAdapter } from "../google/gmailAdapter";
import { ComposeRefusedError } from "../errors";
import type { ScheduledSendPayload } from "../db/schema";
import {
  MessageStore,
  OutboxStore,
  type ScheduledSendKind,
  type ScheduledSendStatus,
  type StoredScheduledSend,
  type Stores,
} from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { createDebug } from "../util/debug";
import { tryAsync } from "../util/effect";
import {
  checkAttachmentSizeEffect,
  cleanList,
  loadUploadsEffect,
  resolveAccountEffect,
  resolveFromEffect,
  resolveMessageEffect,
} from "./outgoing";
import {
  forwardMessageEffect,
  sendNewMessageEffect,
  sendReplyEffect,
  type SendMessageResult,
} from "./reply";

const debug = createDebug("service:scheduledSends");

/** How long a claimed send may stay in flight before another tick may reclaim it. */
export const STALE_CLAIM_MS = 10 * 60 * 1000;

/** Attempts before a send that keeps failing for a transient reason is given up. */
export const MAX_SEND_ATTEMPTS = 3;

/** The states a list shows: what is still to go, and what failed and can be rescheduled. */
const LISTED: readonly ScheduledSendStatus[] = ["pending", "sending", "failed"];

/** A scheduled send, as the API answers it. */
export interface ScheduledSendView {
  id: string;
  accountId: string;
  kind: ScheduledSendKind;
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
  /** The first line of the body, for a list row. */
  preview: string;
  attachmentCount: number;
  createdAt: string;
}

export const scheduledView = (row: StoredScheduledSend): ScheduledSendView => ({
  id: row.id,
  accountId: row.accountId,
  kind: row.kind,
  sourceGmailMessageId: row.sourceGmailMessageId,
  sendAt: row.sendAt.toISOString(),
  status: row.status,
  attempts: row.attempts,
  error: row.error,
  sentAt: row.sentAt ? row.sentAt.toISOString() : null,
  sentMessageId: row.sentMessageId,
  threadId: row.threadId,
  to: row.payload.to,
  cc: row.payload.cc ?? [],
  bcc: row.payload.bcc ?? [],
  subject: row.payload.subject,
  preview:
    row.payload.body
      .split(/\r?\n/)
      .find((l) => l.trim().length > 0)
      ?.slice(0, 140) ?? "",
  attachmentCount:
    (row.payload.uploadIds?.length ?? 0) + (row.payload.forwardAttachmentIds?.length ?? 0),
  createdAt: row.createdAt.toISOString(),
});

export interface ScheduleSendArgs {
  accountId: string;
  kind: ScheduledSendKind;
  /** The message a reply or forward answers; Gmail's id. Required for those two. */
  sourceGmailMessageId?: string;
  payload: ScheduledSendPayload;
  sendAt: Date;
  now?: Date;
  gmail?: GmailDataAdapter;
}

const refuse = (reason: ComposeRefusedError["reason"], message: string) =>
  new ComposeRefusedError({ reason, message });

/**
 * Schedule a message. Everything that can be checked now is checked now — the
 * account, the source message, the recipients, the uploads and their size, the
 * From alias — so a request that would fail at send time is refused while the
 * user is still looking at it.
 */
export const scheduleSendEffect = (
  args: ScheduleSendArgs,
): Effect.Effect<ScheduledSendView, ComposeRefusedError | Error, Stores> =>
  Effect.gen(function* () {
    const now = args.now ?? new Date();
    if (args.sendAt.getTime() <= now.getTime()) {
      return yield* refuse("time_in_past", "A scheduled send has to be in the future.");
    }
    const account = yield* resolveAccountEffect({ accountId: args.accountId });
    if (args.kind !== "new") {
      if (!args.sourceGmailMessageId) {
        return yield* refuse("message_not_found", `A ${args.kind} names the message it answers.`);
      }
      yield* resolveMessageEffect({
        accountId: account.id,
        gmailMessageId: args.sourceGmailMessageId,
      });
    }
    if (args.kind !== "reply" && cleanList(args.payload.to).length === 0) {
      return yield* refuse("no_recipients", "A scheduled message needs at least one To address.");
    }
    const uploads = yield* loadUploadsEffect({
      accountId: account.id,
      uploadIds: args.payload.uploadIds,
    });
    yield* checkAttachmentSizeEffect(uploads);
    const gmail = args.gmail ?? createGmailAdapter();
    yield* resolveFromEffect({ gmail, accountEmail: account.email, from: args.payload.from });

    const domain = account.email.split("@")[1] ?? "miel.local";
    const row = yield* OutboxStore.use((svc) =>
      svc.schedule({
        accountId: account.id,
        kind: args.kind,
        sourceGmailMessageId: args.kind === "new" ? null : (args.sourceGmailMessageId ?? null),
        payload: args.payload,
        messageIdHeader: `<miel.${crypto.randomUUID()}@${domain}>`,
        sendAt: args.sendAt,
      }),
    );
    debug("scheduled", { id: row.id, kind: row.kind, sendAt: row.sendAt.toISOString() });
    return scheduledView(row);
  });

/** Everything still to go (and what failed), soonest first — one account's, or every account's. */
export const listScheduledEffect = (args: {
  accountId?: string;
}): Effect.Effect<ScheduledSendView[], never, OutboxStore> =>
  Effect.map(
    OutboxStore.use((svc) => svc.scheduledList({ accountId: args.accountId, statuses: LISTED })),
    (rows) => rows.map(scheduledView),
  );

/** Why a change to a send did not apply: it does not exist, or it is past changing. */
const notChangedEffect = (id: string): Effect.Effect<never, ComposeRefusedError, OutboxStore> =>
  Effect.gen(function* () {
    const row = yield* OutboxStore.use((svc) => svc.scheduledById(id));
    if (!row) return yield* refuse("scheduled_not_found", `Scheduled send not found: ${id}`);
    return yield* refuse(
      "scheduled_not_editable",
      `This send is ${row.status} and can no longer be changed.`,
    );
  });

/** The toast's Undo, or a cancel from the list: only a send that has not started. */
export const cancelScheduledEffect = (
  id: string,
): Effect.Effect<ScheduledSendView, ComposeRefusedError, OutboxStore> =>
  Effect.gen(function* () {
    const moved = yield* OutboxStore.use((svc) => svc.cancelScheduled(id));
    if (moved === 0) return yield* notChangedEffect(id);
    const row = yield* OutboxStore.use((svc) => svc.scheduledById(id));
    return scheduledView(row!);
  });

/** A new time for a pending send, or a second chance for a failed one. */
export const rescheduleEffect = (args: {
  id: string;
  sendAt: Date;
  now?: Date;
}): Effect.Effect<ScheduledSendView, ComposeRefusedError, OutboxStore> =>
  Effect.gen(function* () {
    const now = args.now ?? new Date();
    if (args.sendAt.getTime() <= now.getTime()) {
      return yield* refuse("time_in_past", "A scheduled send has to be in the future.");
    }
    const moved = yield* OutboxStore.use((svc) =>
      svc.reschedule({ id: args.id, sendAt: args.sendAt }),
    );
    if (moved === 0) return yield* notChangedEffect(args.id);
    const row = yield* OutboxStore.use((svc) => svc.scheduledById(args.id));
    return scheduledView(row!);
  });

/** Send one claimed row through the send service its kind names. */
const dispatchEffect = (
  row: StoredScheduledSend,
  gmail: GmailDataAdapter,
): Effect.Effect<SendMessageResult, Error, Stores> => {
  const p = row.payload;
  const common = {
    accountId: row.accountId,
    from: p.from,
    uploadIds: p.uploadIds,
    draftId: p.draftId,
    messageId: row.messageIdHeader,
    gmail,
  };
  switch (row.kind) {
    case "new":
      return sendNewMessageEffect({
        ...common,
        to: p.to,
        cc: p.cc,
        bcc: p.bcc,
        subject: p.subject,
        body: p.body,
      });
    case "reply":
      return sendReplyEffect({
        ...common,
        gmailMessageId: row.sourceGmailMessageId ?? "",
        to: p.to.length > 0 ? p.to : undefined,
        cc: p.cc,
        bcc: p.bcc,
        replyAll: p.replyAll,
        subject: p.subject,
        body: p.body,
        includeQuote: p.includeQuote,
        quotedText: p.quotedText,
      });
    case "forward":
      return forwardMessageEffect({
        ...common,
        gmailMessageId: row.sourceGmailMessageId ?? "",
        to: p.to,
        cc: p.cc,
        bcc: p.bcc,
        subject: p.subject,
        body: p.body,
        keepAttachmentIds: p.forwardAttachmentIds,
      });
  }
};

/**
 * Whether a failure is worth another attempt. A refusal of ours, or Gmail
 * refusing the message itself ("Invalid To header"), will refuse again; a
 * timeout or an outage may not.
 */
const isPermanent = (err: Error): boolean => {
  const tag = (err as { _tag?: string })._tag;
  if (tag === "ComposeRefusedError") return true;
  if (tag === "GmailSendError") return Boolean((err as { detail?: string }).detail);
  return false;
};

/** The message a first attempt may already have sent, looked up by its Message-ID. */
const alreadySentEffect = (
  row: StoredScheduledSend,
  gmail: GmailDataAdapter,
): Effect.Effect<{ messageId: string; threadId: string } | null, never, MessageStore> =>
  Effect.gen(function* () {
    const account = yield* MessageStore.use((svc) => svc.accountById(row.accountId));
    if (!account) return null;
    const id = row.messageIdHeader.replace(/^<|>$/g, "");
    const hits = yield* tryAsync(() =>
      gmail.searchMessages({ account: account.email, query: `rfc822msgid:${id}`, max: 1 }),
    ).pipe(Effect.catch(() => Effect.succeed([])));
    return hits[0] ?? null;
  });

/**
 * Claim and send what is due. Answers what happened to each claimed row, which
 * is what the loop logs and the tests assert.
 */
export const runDueScheduledSendsEffect = (args: {
  now: Date;
  limit?: number;
  gmail?: GmailDataAdapter;
}): Effect.Effect<{ id: string; outcome: "sent" | "failed" | "retry" }[], never, Stores> =>
  Effect.gen(function* () {
    const claimed = yield* OutboxStore.use((svc) =>
      svc.claimDue({
        now: args.now,
        staleBefore: new Date(args.now.getTime() - STALE_CLAIM_MS),
        limit: args.limit ?? 20,
      }),
    );
    if (claimed.length === 0) return [];
    const gmail = args.gmail ?? createGmailAdapter();
    const results: { id: string; outcome: "sent" | "failed" | "retry" }[] = [];
    for (const row of claimed) {
      // Claimed before: a previous attempt may have reached Gmail and died
      // before it could say so. Look for it before sending a second copy.
      if (row.attempts > 1) {
        const landed = yield* alreadySentEffect(row, gmail);
        if (landed) {
          yield* OutboxStore.use((svc) =>
            svc.finishScheduled({
              id: row.id,
              outcome: {
                kind: "sent",
                sentAt: args.now,
                sentMessageId: landed.messageId,
                threadId: landed.threadId,
              },
            }),
          );
          results.push({ id: row.id, outcome: "sent" });
          continue;
        }
      }
      const sent = yield* Effect.result(dispatchEffect(row, gmail));
      if (sent._tag === "Success") {
        yield* OutboxStore.use((svc) =>
          svc.finishScheduled({
            id: row.id,
            outcome: {
              kind: "sent",
              sentAt: new Date(),
              sentMessageId: sent.success.sentMessageId,
              threadId: sent.success.threadId,
            },
          }),
        );
        results.push({ id: row.id, outcome: "sent" });
        continue;
      }
      const err = sent.failure;
      const detail = (err as { detail?: string }).detail ?? err.message ?? String(err);
      const giveUp = isPermanent(err) || row.attempts >= MAX_SEND_ATTEMPTS;
      debug.warn("scheduled send failed", { id: row.id, attempts: row.attempts, giveUp, detail });
      yield* OutboxStore.use((svc) =>
        svc.finishScheduled({
          id: row.id,
          outcome: giveUp
            ? { kind: "failed", error: detail || "Send failed" }
            : {
                kind: "retry",
                // 2, 4 minutes: long enough for a blip to pass.
                sendAt: new Date(args.now.getTime() + 2 ** row.attempts * 60_000),
                error: detail || "Send failed",
              },
        }),
      );
      results.push({ id: row.id, outcome: giveUp ? "failed" : "retry" });
    }
    return results;
  });

// Promise facades for the API/CLI boundary.
export async function scheduleSend(args: ScheduleSendArgs): Promise<ScheduledSendView> {
  return runWithStores(scheduleSendEffect(args));
}

export async function listScheduled(args: { accountId?: string }): Promise<ScheduledSendView[]> {
  return runWithStores(listScheduledEffect(args));
}

export async function cancelScheduled(id: string): Promise<ScheduledSendView> {
  return runWithStores(cancelScheduledEffect(id));
}

export async function reschedule(args: { id: string; sendAt: Date }): Promise<ScheduledSendView> {
  return runWithStores(rescheduleEffect(args));
}
