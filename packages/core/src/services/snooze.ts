/**
 * Snooze: take a conversation out of the inbox until a chosen time, then put it
 * back on top, unread.
 *
 * Gmail's API has no snooze — Gmail's own is a web-client feature with no
 * endpoint — so miel does what it looks like from the outside: snoozing
 * archives the thread in Gmail (INBOX off, exactly as archive does) and records
 * the wake time in `snoozes`; waking puts INBOX back on the thread and UNREAD on
 * the message that was snoozed, then drops the row. Until it wakes, the thread
 * is in the Snoozed view and not in Done.
 *
 * Gmail is told first and the local write follows, as for every message action,
 * so a refusal leaves the mailbox and the database agreeing. The wake runs in
 * the API process's due-work loop (`dueWork.ts`), so a snooze wakes on time
 * only while the API is up — after a restart, everything overdue wakes on the
 * first tick.
 */
import { Effect } from "effect";
import { createGmailAdapter, type GmailDataAdapter } from "../google/gmailAdapter";
import { ComposeRefusedError } from "../errors";
import { LabelStore, MessageStore } from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { createDebug } from "../util/debug";
import { tryAsync } from "../util/effect";
import { resolveAccountEffect } from "./outgoing";

const debug = createDebug("service:snooze");

/** How long a wake Gmail refused waits before it is tried again. */
export const WAKE_RETRY_MS = 15 * 60 * 1000;

export interface SnoozeArgs {
  accountId: string;
  gmailMessageId: string;
  until: Date;
  now?: Date;
  gmail?: GmailDataAdapter;
}

export interface SnoozeResult {
  ok: true;
  threadId: string;
  snoozedUntil: string;
}

const threadOf = (accountId: string, gmailMessageId: string) =>
  Effect.gen(function* () {
    const threadId = yield* MessageStore.use((svc) =>
      svc.threadIdOf({ accountId, gmailMessageId }),
    );
    if (threadId === null) {
      return yield* new ComposeRefusedError({
        reason: "message_not_found",
        message: `Message not found: ${gmailMessageId}`,
      });
    }
    return threadId;
  });

export const snoozeMessageEffect = (
  args: SnoozeArgs,
): Effect.Effect<SnoozeResult, ComposeRefusedError | Error, MessageStore> =>
  Effect.gen(function* () {
    const now = args.now ?? new Date();
    if (args.until.getTime() <= now.getTime()) {
      return yield* new ComposeRefusedError({
        reason: "time_in_past",
        message: "A snooze has to end in the future.",
      });
    }
    const account = yield* resolveAccountEffect({ accountId: args.accountId });
    const threadId = yield* threadOf(account.id, args.gmailMessageId);
    const gmail = args.gmail ?? createGmailAdapter();
    yield* tryAsync(() => gmail.archiveThread({ account: account.email, threadId }));
    yield* MessageStore.use((svc) =>
      svc.setFlagsForThread({
        accountId: account.id,
        gmailThreadId: threadId,
        flags: { isArchived: true },
      }),
    );
    yield* MessageStore.use((svc) =>
      svc.snooze({
        accountId: account.id,
        gmailThreadId: threadId,
        gmailMessageId: args.gmailMessageId,
        wakeAt: args.until,
      }),
    );
    debug("snoozed", { threadId, until: args.until.toISOString() });
    return { ok: true, threadId, snoozedUntil: args.until.toISOString() };
  });

/**
 * Wake a conversation now, by hand — "Unsnooze", or the toast's Undo. INBOX goes
 * back on the thread and the row is dropped; the message is not marked unread,
 * because the user is looking at it.
 */
export const unsnoozeMessageEffect = (args: {
  accountId: string;
  gmailMessageId: string;
  gmail?: GmailDataAdapter;
}): Effect.Effect<{ ok: true; threadId: string }, ComposeRefusedError | Error, MessageStore> =>
  Effect.gen(function* () {
    const account = yield* resolveAccountEffect({ accountId: args.accountId });
    const threadId = yield* threadOf(account.id, args.gmailMessageId);
    const gmail = args.gmail ?? createGmailAdapter();
    yield* tryAsync(() => gmail.unarchiveThread({ account: account.email, threadId }));
    yield* MessageStore.use((svc) =>
      svc.setFlagsForThread({
        accountId: account.id,
        gmailThreadId: threadId,
        flags: { isArchived: false },
      }),
    );
    yield* MessageStore.use((svc) =>
      svc.unsnooze({ accountId: account.id, gmailThreadId: threadId }),
    );
    debug("unsnoozed", { threadId });
    return { ok: true, threadId } as const;
  });

/**
 * Wake every snooze that is due: INBOX back on the thread, UNREAD on the
 * snoozed message (Gmail's own snooze brings a conversation back unread, at the
 * top), the local flags to match, the row dropped. A wake Gmail refuses — a
 * revoked grant, an outage — is pushed back {@link WAKE_RETRY_MS} rather than
 * retried on every tick. Answers how many woke.
 */
export const wakeDueSnoozesEffect = (args: {
  now: Date;
  limit?: number;
  gmail?: GmailDataAdapter;
}): Effect.Effect<number, never, MessageStore | LabelStore> =>
  Effect.gen(function* () {
    const due = yield* MessageStore.use((svc) =>
      svc.dueSnoozes({ now: args.now, limit: args.limit ?? 50 }),
    );
    if (due.length === 0) return 0;
    const gmail = args.gmail ?? createGmailAdapter();
    let woke = 0;
    for (const snooze of due) {
      const inGmail = yield* Effect.result(
        Effect.gen(function* () {
          yield* tryAsync(() =>
            gmail.unarchiveThread({ account: snooze.accountEmail, threadId: snooze.gmailThreadId }),
          );
          yield* tryAsync(() =>
            gmail.batchModifyLabels({
              account: snooze.accountEmail,
              messageIds: [snooze.gmailMessageId],
              add: ["UNREAD"],
            }),
          );
        }),
      );
      if (inGmail._tag === "Failure") {
        debug.warn("wake refused, retrying later", {
          threadId: snooze.gmailThreadId,
          message: inGmail.failure.message,
        });
        yield* MessageStore.use((svc) =>
          svc.snooze({ ...snooze, wakeAt: new Date(args.now.getTime() + WAKE_RETRY_MS) }),
        );
        continue;
      }
      yield* MessageStore.use((svc) =>
        svc.setFlagsForThread({
          accountId: snooze.accountId,
          gmailThreadId: snooze.gmailThreadId,
          flags: { isArchived: false },
        }),
      );
      const [unread] = yield* LabelStore.use((svc) =>
        svc.byGmailIds({ accountId: snooze.accountId, gmailLabelIds: ["UNREAD"] }),
      );
      if (unread) {
        yield* MessageStore.use((svc) =>
          svc.attachLabels({
            accountId: snooze.accountId,
            gmailMessageIds: [snooze.gmailMessageId],
            labelIds: [unread.id],
          }),
        );
      }
      yield* MessageStore.use((svc) =>
        svc.unsnooze({ accountId: snooze.accountId, gmailThreadId: snooze.gmailThreadId }),
      );
      woke += 1;
    }
    debug("woke", { due: due.length, woke });
    return woke;
  });

// Promise facades for the API/CLI boundary.
export async function snoozeMessage(args: SnoozeArgs): Promise<SnoozeResult> {
  return runWithStores(snoozeMessageEffect(args));
}

export async function unsnoozeMessage(args: {
  accountId: string;
  gmailMessageId: string;
}): Promise<{ ok: true; threadId: string }> {
  return runWithStores(unsnoozeMessageEffect(args));
}
