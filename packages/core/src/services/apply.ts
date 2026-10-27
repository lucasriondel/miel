// Everything a message action does: attach and detach labels, archive, trash,
// mark read, and the batch versions of those.
//
// Two collaborators, and the split between them is the point. Gmail is reached
// through `GmailDataAdapter` and is always called *before* the local write, so a
// refused modification leaves the mailbox and the database agreeing. Storage is
// reached only through the store seam (#136) — `MessageStore` and `LabelStore` —
// so what is left here is the ordering and the label-id scoping.
import { Effect } from "effect";
import { LabelStore, MessageStore } from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { createGmailAdapter, type GmailDataAdapter } from "../google/gmailAdapter";
import { createDebug } from "../util/debug";
import { tryAsync } from "../util/effect";
import type { LabelRow } from "./labels";

const debug = createDebug("service:apply");

export interface ApplyLabelsResult {
  ok: true;
  added: { labelId: string; gmailLabelId: string; name: string }[];
  removed: { labelId: string; gmailLabelId: string; name: string }[];
}

interface ApplyAccountResolved {
  accountId: string;
  accountEmail: string;
  gmail: GmailDataAdapter;
}

interface ApplyContextResolved extends ApplyAccountResolved {
  gmailMessageId: string;
}

/**
 * Which account this action is for, named either way round.
 *
 * The API sends an id and the CLI an email, and both have to end up with both:
 * Gmail is addressed by email, our own rows by id.
 */
const resolveAccountContextEffect = (args: {
  accountEmail?: string;
  accountId?: string;
  gmail?: GmailDataAdapter;
}): Effect.Effect<ApplyAccountResolved, Error, MessageStore> =>
  Effect.gen(function* () {
    const gmail = args.gmail ?? createGmailAdapter();
    const accountEmail = args.accountEmail;
    if (accountEmail) {
      const acc = yield* MessageStore.use((svc) => svc.accountByEmail(accountEmail));
      if (!acc) {
        return yield* Effect.fail(new Error(`Account not synced: ${args.accountEmail}`));
      }
      return { accountId: acc.id, accountEmail: acc.email, gmail };
    }
    const accountId = args.accountId;
    if (!accountId) {
      return yield* Effect.fail(new Error("accountEmail or accountId is required"));
    }
    const acc = yield* MessageStore.use((svc) => svc.accountById(accountId));
    if (!acc) {
      return yield* Effect.fail(new Error(`Account not found: ${args.accountId}`));
    }
    return { accountId: acc.id, accountEmail: acc.email, gmail };
  });

const resolveContextEffect = (args: {
  accountEmail?: string;
  accountId?: string;
  gmailMessageId: string;
  gmail?: GmailDataAdapter;
}): Effect.Effect<ApplyContextResolved, Error, MessageStore> =>
  Effect.map(resolveAccountContextEffect(args), (ctx) => ({
    ...ctx,
    gmailMessageId: args.gmailMessageId,
  }));

export const applyLabelsEffect = (args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
  gmail?: GmailDataAdapter;
}): Effect.Effect<ApplyLabelsResult, Error, MessageStore | LabelStore> =>
  Effect.gen(function* () {
    debug("applyLabels", {
      accountEmail: args.accountEmail,
      accountId: args.accountId,
      gmailMessageId: args.gmailMessageId,
      add: args.addLabelIds ?? [],
      remove: args.removeLabelIds ?? [],
    });
    const ctx = yield* resolveContextEffect(args);

    // Looked up scoped to the account, so a label id from another account is
    // simply not found rather than attached.
    const allIds = [...(args.addLabelIds ?? []), ...(args.removeLabelIds ?? [])];
    const labelRows = yield* LabelStore.use((svc) =>
      svc.byIds({ accountId: ctx.accountId, ids: allIds }),
    );
    const byId = new Map(labelRows.map((l) => [l.id, l]));

    const addRows = (args.addLabelIds ?? [])
      .map((id) => byId.get(id))
      .filter((l): l is LabelRow => Boolean(l));
    const removeRows = (args.removeLabelIds ?? [])
      .map((id) => byId.get(id))
      .filter((l): l is LabelRow => Boolean(l));

    if (addRows.length === 0 && removeRows.length === 0) {
      debug("applyLabels noop", { gmailMessageId: ctx.gmailMessageId });
      return { ok: true, added: [], removed: [] } satisfies ApplyLabelsResult;
    }

    yield* tryAsync(() =>
      ctx.gmail.batchModifyLabels({
        account: ctx.accountEmail,
        messageIds: [ctx.gmailMessageId],
        add: addRows.length ? addRows.map((l) => l.gmailLabelId) : undefined,
        remove: removeRows.length ? removeRows.map((l) => l.gmailLabelId) : undefined,
      }),
    );

    yield* MessageStore.use((svc) =>
      svc.attachLabels({
        accountId: ctx.accountId,
        gmailMessageIds: [ctx.gmailMessageId],
        labelIds: addRows.map((l) => l.id),
      }),
    );
    yield* MessageStore.use((svc) =>
      svc.detachLabels({
        accountId: ctx.accountId,
        gmailMessageIds: [ctx.gmailMessageId],
        labelIds: removeRows.map((l) => l.id),
      }),
    );

    debug("applyLabels done", {
      gmailMessageId: ctx.gmailMessageId,
      added: addRows.map((l) => l.name),
      removed: removeRows.map((l) => l.name),
    });
    return {
      ok: true,
      added: addRows.map((l) => ({
        labelId: l.id,
        gmailLabelId: l.gmailLabelId,
        name: l.name,
      })),
      removed: removeRows.map((l) => ({
        labelId: l.id,
        gmailLabelId: l.gmailLabelId,
        name: l.name,
      })),
    } satisfies ApplyLabelsResult;
  });

/**
 * Archive and trash are the same shape: find the thread, tell Gmail, then mark
 * every message in that thread locally.
 *
 * The thread-wide local write is deliberate — Gmail archives and trashes whole
 * threads, so marking only the one message would leave its siblings in the list
 * and make the action look like it had been undone.
 */
const threadActionEffect = (
  args: {
    accountId?: string;
    accountEmail?: string;
    gmailMessageId: string;
    gmail?: GmailDataAdapter;
  },
  action: {
    name: "archiveMessage" | "trashMessage";
    inGmail: (gmail: GmailDataAdapter, o: { account: string; threadId: string }) => Promise<void>;
    flags: { isArchived: true } | { isTrashed: true };
  },
): Effect.Effect<{ ok: true; threadId: string }, Error, MessageStore> =>
  Effect.gen(function* () {
    debug(action.name, {
      gmailMessageId: args.gmailMessageId,
      accountEmail: args.accountEmail,
    });
    const ctx = yield* resolveContextEffect(args);
    const threadId = yield* MessageStore.use((svc) => svc.threadIdOf(ctx));
    if (threadId === null) {
      return yield* Effect.fail(new Error(`Message not found: ${ctx.gmailMessageId}`));
    }
    yield* tryAsync(() => action.inGmail(ctx.gmail, { account: ctx.accountEmail, threadId }));
    yield* MessageStore.use((svc) =>
      svc.setFlagsForThread({
        accountId: ctx.accountId,
        gmailThreadId: threadId,
        flags: action.flags,
      }),
    );
    debug(`${action.name} done`, { gmailMessageId: ctx.gmailMessageId, threadId });
    return { ok: true, threadId } as const;
  });

export const archiveMessageEffect = (args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  gmail?: GmailDataAdapter;
}): Effect.Effect<{ ok: true; threadId: string }, Error, MessageStore> =>
  threadActionEffect(args, {
    name: "archiveMessage",
    inGmail: (gmail, o) => gmail.archiveThread(o),
    flags: { isArchived: true },
  });

export const trashMessageEffect = (args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  gmail?: GmailDataAdapter;
}): Effect.Effect<{ ok: true; threadId: string }, Error, MessageStore> =>
  threadActionEffect(args, {
    name: "trashMessage",
    inGmail: (gmail, o) => gmail.trashThread(o),
    flags: { isTrashed: true },
  });

export type BatchMessageAction = "read" | "unread" | "archive" | "trash" | "label";

/** The four flag actions; everything that is a label delta and nothing else. */
type FlagBatchAction = Exclude<BatchMessageAction, "label">;

/**
 * How a batch action carries its payload (#147).
 *
 * The four flag actions are the action alone — what they add and remove is
 * fixed. The fifth needs to say *which* label, and it names it by our own row
 * id, not Gmail's: a caller cannot then reach a mailbox it has no rows for,
 * because the id is looked up scoped to the account, exactly as the
 * single-message `applyLabels` does it.
 */
export type BatchMessageActionInput =
  | { action: FlagBatchAction }
  | { action: "label"; labelId: string };

/** The same action once the label id has been resolved to a Gmail label. */
export type ResolvedBatchAction =
  | { action: FlagBatchAction }
  | { action: "label"; gmailLabelId: string };

export interface BatchModifyMessagesResult {
  ok: true;
  action: BatchMessageAction;
  count: number;
}

// Extracted so the action → Gmail-label mapping stays unit-testable without
// reaching through batchModifyMessagesEffect's store-bound path. It takes the
// *resolved* action, so the label case carries the Gmail id the switch needs
// rather than a row id it would have to go and look up.
export function gmailLabelDeltasForBatchAction(resolved: ResolvedBatchAction): {
  add: string[];
  remove: string[];
} {
  switch (resolved.action) {
    case "read":
      return { add: [], remove: ["UNREAD"] };
    case "unread":
      return { add: ["UNREAD"], remove: [] };
    case "archive":
      return { add: [], remove: ["INBOX"] };
    case "trash":
      return { add: ["TRASH"], remove: ["INBOX"] };
    case "label":
      return { add: [resolved.gmailLabelId], remove: [] };
  }
}

/**
 * The label id as an account's own label, or a failure.
 *
 * A label id belonging to another account names nothing here, and that is
 * refused rather than quietly dropped: unlike `applyLabels`, where an unknown
 * id is one of several and the rest still apply, a batch label action has
 * nothing left to do without it, and telling Gmail nothing while answering
 * "ok" would read as the label having been applied.
 */
const resolveBatchActionEffect = (
  accountId: string,
  input: BatchMessageActionInput,
): Effect.Effect<ResolvedBatchAction, Error, LabelStore> =>
  input.action !== "label"
    ? Effect.succeed({ action: input.action })
    : Effect.gen(function* () {
        const [label] = yield* LabelStore.use((svc) =>
          svc.byIds({ accountId, ids: [input.labelId] }),
        );
        if (!label) {
          return yield* Effect.fail(new Error(`Label not found: ${input.labelId}`));
        }
        return { action: "label", gmailLabelId: label.gmailLabelId } as const;
      });

export const batchModifyMessagesEffect = (
  args: {
    accountId?: string;
    accountEmail?: string;
    gmailMessageIds: string[];
    gmail?: GmailDataAdapter;
  } & BatchMessageActionInput,
): Effect.Effect<BatchModifyMessagesResult, Error, MessageStore | LabelStore> =>
  Effect.gen(function* () {
    debug("batchModifyMessages", {
      action: args.action,
      count: args.gmailMessageIds.length,
    });

    if (args.gmailMessageIds.length === 0) {
      return {
        ok: true,
        action: args.action,
        count: 0,
      } satisfies BatchModifyMessagesResult;
    }

    const ctx = yield* resolveAccountContextEffect(args);
    const resolved = yield* resolveBatchActionEffect(ctx.accountId, args);

    const { add: addGmailLabels, remove: removeGmailLabels } =
      gmailLabelDeltasForBatchAction(resolved);

    yield* tryAsync(() =>
      ctx.gmail.batchModifyLabels({
        account: ctx.accountEmail,
        messageIds: args.gmailMessageIds,
        add: addGmailLabels.length ? addGmailLabels : undefined,
        remove: removeGmailLabels.length ? removeGmailLabels : undefined,
      }),
    );

    // A Gmail label we have never synced has no row of ours to mirror the
    // change onto; that is not an error, there is simply nothing to write.
    const labelRows = yield* LabelStore.use((svc) =>
      svc.byGmailIds({
        accountId: ctx.accountId,
        gmailLabelIds: [...addGmailLabels, ...removeGmailLabels],
      }),
    );
    const labelByGmailId = new Map(labelRows.map((l) => [l.gmailLabelId, l.id]));
    const idsOf = (gmailLabelIds: string[]) =>
      gmailLabelIds
        .map((gmailLabelId) => labelByGmailId.get(gmailLabelId))
        .filter((id): id is string => Boolean(id));

    yield* MessageStore.use((svc) =>
      svc.detachLabels({
        accountId: ctx.accountId,
        gmailMessageIds: args.gmailMessageIds,
        labelIds: idsOf(removeGmailLabels),
      }),
    );
    yield* MessageStore.use((svc) =>
      svc.attachLabels({
        accountId: ctx.accountId,
        gmailMessageIds: args.gmailMessageIds,
        labelIds: idsOf(addGmailLabels),
      }),
    );

    if (args.action === "archive" || args.action === "trash") {
      yield* MessageStore.use((svc) =>
        svc.setFlagsForMessages({
          accountId: ctx.accountId,
          gmailMessageIds: args.gmailMessageIds,
          flags: args.action === "archive" ? { isArchived: true } : { isTrashed: true },
        }),
      );
    }

    debug("batchModifyMessages done", {
      action: args.action,
      count: args.gmailMessageIds.length,
    });
    return {
      ok: true,
      action: args.action,
      count: args.gmailMessageIds.length,
    } satisfies BatchModifyMessagesResult;
  });

export const setMessageReadEffect = (args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  read: boolean;
  gmail?: GmailDataAdapter;
}): Effect.Effect<{ ok: true; read: boolean }, Error, MessageStore | LabelStore> =>
  Effect.gen(function* () {
    debug("setMessageRead", {
      gmailMessageId: args.gmailMessageId,
      read: args.read,
    });
    const ctx = yield* resolveContextEffect(args);

    const [unreadLabel] = yield* LabelStore.use((svc) =>
      svc.byGmailIds({
        accountId: ctx.accountId,
        gmailLabelIds: ["UNREAD"],
      }),
    );

    yield* tryAsync(() =>
      ctx.gmail.batchModifyLabels({
        account: ctx.accountEmail,
        messageIds: [ctx.gmailMessageId],
        add: args.read ? undefined : ["UNREAD"],
        remove: args.read ? ["UNREAD"] : undefined,
      }),
    );

    if (unreadLabel) {
      const messages = yield* MessageStore;
      const write = args.read ? messages.detachLabels : messages.attachLabels;
      yield* write({
        accountId: ctx.accountId,
        gmailMessageIds: [ctx.gmailMessageId],
        labelIds: [unreadLabel.id],
      });
    }

    debug("setMessageRead done", {
      gmailMessageId: ctx.gmailMessageId,
      read: args.read,
    });
    return { ok: true, read: args.read } as const;
  });

// Promise facades for the API/CLI boundary.
export async function applyLabels(args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
  gmail?: GmailDataAdapter;
}): Promise<ApplyLabelsResult> {
  return runWithStores(applyLabelsEffect(args));
}

export async function archiveMessage(args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  gmail?: GmailDataAdapter;
}): Promise<{ ok: true; threadId: string }> {
  return runWithStores(archiveMessageEffect(args));
}

export async function trashMessage(args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  gmail?: GmailDataAdapter;
}): Promise<{ ok: true; threadId: string }> {
  return runWithStores(trashMessageEffect(args));
}

export async function batchModifyMessages(
  args: {
    accountId?: string;
    accountEmail?: string;
    gmailMessageIds: string[];
    gmail?: GmailDataAdapter;
  } & BatchMessageActionInput,
): Promise<BatchModifyMessagesResult> {
  return runWithStores(batchModifyMessagesEffect(args));
}

export async function setMessageRead(args: {
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  read: boolean;
  gmail?: GmailDataAdapter;
}): Promise<{ ok: true; read: boolean }> {
  return runWithStores(setMessageReadEffect(args));
}
