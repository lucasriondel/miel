// Everything a message action does: attach and detach labels, accept a triage's
// suggestions, archive, trash, mark read, and the batch versions of those.
//
// Two collaborators, and the split between them is the point. Gmail is reached
// through `GmailDataAdapter` and is always called *before* the local write, so a
// refused modification leaves the mailbox and the database agreeing. Storage is
// reached only through the store seam (#136) — `MessageStore`, `TriageStore` and
// `LabelStore` — so what is left here is the ordering, the label-id scoping and
// the bookkeeping that turns an accepted suggestion into an attached label.
import { Effect } from "effect";
import {
  LabelStore,
  MessageStore,
  TriageStore,
  type StoredNewSuggestion,
} from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { createGmailAdapter, type GmailDataAdapter } from "../google/gmailAdapter";
import { createDebug } from "../util/debug";
import { tryAsync } from "../util/effect";
import { ensureLabelEffect, type LabelRow } from "./labels";

const debug = createDebug("service:apply");

/** What every action needs before it can act: the stores and Gmail. */
type ApplyStores = MessageStore | TriageStore | LabelStore;

export interface ApplyLabelsResult {
  ok: true;
  added: { labelId: string; gmailLabelId: string; name: string }[];
  removed: { labelId: string; gmailLabelId: string; name: string }[];
}

export interface ApplySuggestionsResult {
  ok: true;
  appliedExistingLabelIds: string[];
  createdLabels: { suggestionId: string; labelId: string; name: string }[];
  attached: { gmailLabelId: string; name: string }[];
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
    if (args.accountEmail) {
      const acc = yield* MessageStore.accountByEmail(args.accountEmail);
      if (!acc) {
        return yield* Effect.fail(new Error(`Account not synced: ${args.accountEmail}`));
      }
      return { accountId: acc.id, accountEmail: acc.email, gmail };
    }
    if (!args.accountId) {
      return yield* Effect.fail(new Error("accountEmail or accountId is required"));
    }
    const acc = yield* MessageStore.accountById(args.accountId);
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
    const labelRows = yield* LabelStore.byIds({ accountId: ctx.accountId, ids: allIds });
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

    yield* MessageStore.attachLabels({
      accountId: ctx.accountId,
      gmailMessageIds: [ctx.gmailMessageId],
      labelIds: addRows.map((l) => l.id),
    });
    yield* MessageStore.detachLabels({
      accountId: ctx.accountId,
      gmailMessageIds: [ctx.gmailMessageId],
      labelIds: removeRows.map((l) => l.id),
    });

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

export interface ApplySuggestionsInput {
  triageId: string;
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  acceptExistingLabelIds?: string[];
  acceptNewSuggestionIds?: string[];
  gmail?: GmailDataAdapter;
}

export const applySuggestionsEffect = (
  input: ApplySuggestionsInput,
): Effect.Effect<ApplySuggestionsResult, Error, ApplyStores> =>
  Effect.gen(function* () {
    debug("applySuggestions", {
      triageId: input.triageId,
      gmailMessageId: input.gmailMessageId,
      acceptExisting: input.acceptExistingLabelIds ?? [],
      acceptNew: input.acceptNewSuggestionIds ?? [],
    });
    const ctx = yield* resolveContextEffect(input);

    const triage = yield* TriageStore.byId(input.triageId);
    if (!triage) {
      return yield* Effect.fail(new Error(`Triage not found: ${input.triageId}`));
    }
    if (triage.gmailMessageId !== ctx.gmailMessageId) {
      return yield* Effect.fail(
        new Error(`Triage ${input.triageId} does not belong to message ${ctx.gmailMessageId}`),
      );
    }

    const existingIds = input.acceptExistingLabelIds ?? [];
    const newIds = input.acceptNewSuggestionIds ?? [];

    const existingRows = yield* LabelStore.byIds({
      accountId: ctx.accountId,
      ids: existingIds,
    });

    // Only this triage's suggestions, in the order they were accepted: a
    // suggestion id belonging to another triage names nothing here.
    const suggestions = yield* TriageStore.newSuggestionsFor([input.triageId]);
    const byId = new Map(suggestions.map((s) => [s.suggestionId, s]));
    const accepted = newIds
      .map((id) => byId.get(id))
      .filter((s): s is StoredNewSuggestion => Boolean(s));

    const createdLabels: ApplySuggestionsResult["createdLabels"] = [];
    const labelsToAttach: { id: string; gmailLabelId: string; name: string }[] = existingRows.map(
      (l) => ({
        id: l.id,
        gmailLabelId: l.gmailLabelId,
        name: l.name,
      }),
    );

    for (const sug of accepted) {
      const label = yield* ensureLabelEffect({
        accountId: ctx.accountId,
        accountEmail: ctx.accountEmail,
        name: sug.name,
        gmail: ctx.gmail,
      });
      yield* TriageStore.markNewApplied({
        suggestionId: sug.suggestionId,
        createdLabelId: label.id,
      });
      createdLabels.push({
        suggestionId: sug.suggestionId,
        labelId: label.id,
        name: label.name,
      });
      labelsToAttach.push({
        id: label.id,
        gmailLabelId: label.gmailLabelId,
        name: label.name,
      });
    }

    if (labelsToAttach.length > 0) {
      yield* tryAsync(() =>
        ctx.gmail.batchModifyLabels({
          account: ctx.accountEmail,
          messageIds: [ctx.gmailMessageId],
          add: labelsToAttach.map((l) => l.gmailLabelId),
        }),
      );
      yield* MessageStore.attachLabels({
        accountId: ctx.accountId,
        gmailMessageIds: [ctx.gmailMessageId],
        labelIds: labelsToAttach.map((l) => l.id),
      });
    }

    yield* TriageStore.markExistingApplied({
      triageId: input.triageId,
      labelIds: existingRows.map((l) => l.id),
    });

    debug("applySuggestions done", {
      triageId: input.triageId,
      appliedExisting: existingRows.map((l) => l.name),
      createdLabels: createdLabels.map((l) => l.name),
      attached: labelsToAttach.map((l) => l.name),
    });
    return {
      ok: true,
      appliedExistingLabelIds: existingRows.map((l) => l.id),
      createdLabels,
      attached: labelsToAttach.map((l) => ({
        gmailLabelId: l.gmailLabelId,
        name: l.name,
      })),
    } satisfies ApplySuggestionsResult;
  });

export interface DismissSuggestionsInput {
  triageId: string;
  accountId?: string;
  accountEmail?: string;
  gmailMessageId: string;
  gmail?: GmailDataAdapter;
}

export interface DismissSuggestionsResult {
  ok: true;
  triageId: string;
}

/**
 * Turns down every pending suggestion of one triage — the row pill's "Dismiss
 * all", which is one gesture over both suggestion tables because the pill counts
 * them together.
 *
 * Unlike its apply counterpart this reaches nothing outside Postgres: declining
 * a suggestion changes what miel offers, never what Gmail holds, so there is no
 * remote call to keep in step and `GmailDataAdapter` rides along only so the
 * caller can resolve the message the same way every other action does. The
 * triage is still checked against the message for the reason apply checks it: a
 * triage id from another message must name nothing here.
 */
export const dismissSuggestionsEffect = (
  input: DismissSuggestionsInput,
): Effect.Effect<DismissSuggestionsResult, Error, ApplyStores> =>
  Effect.gen(function* () {
    debug("dismissSuggestions", {
      triageId: input.triageId,
      gmailMessageId: input.gmailMessageId,
    });
    const ctx = yield* resolveContextEffect(input);

    const triage = yield* TriageStore.byId(input.triageId);
    if (!triage) {
      return yield* Effect.fail(new Error(`Triage not found: ${input.triageId}`));
    }
    if (triage.gmailMessageId !== ctx.gmailMessageId) {
      return yield* Effect.fail(
        new Error(`Triage ${input.triageId} does not belong to message ${ctx.gmailMessageId}`),
      );
    }

    yield* TriageStore.dismissPending({ triageId: input.triageId });

    debug("dismissSuggestions done", { triageId: input.triageId });
    return { ok: true, triageId: input.triageId } satisfies DismissSuggestionsResult;
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
    const threadId = yield* MessageStore.threadIdOf(ctx);
    if (threadId === null) {
      return yield* Effect.fail(new Error(`Message not found: ${ctx.gmailMessageId}`));
    }
    yield* tryAsync(() => action.inGmail(ctx.gmail, { account: ctx.accountEmail, threadId }));
    yield* MessageStore.setFlagsForThread({
      accountId: ctx.accountId,
      gmailThreadId: threadId,
      flags: action.flags,
    });
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
        const [label] = yield* LabelStore.byIds({ accountId, ids: [input.labelId] });
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
    const labelRows = yield* LabelStore.byGmailIds({
      accountId: ctx.accountId,
      gmailLabelIds: [...addGmailLabels, ...removeGmailLabels],
    });
    const labelByGmailId = new Map(labelRows.map((l) => [l.gmailLabelId, l.id]));
    const idsOf = (gmailLabelIds: string[]) =>
      gmailLabelIds
        .map((gmailLabelId) => labelByGmailId.get(gmailLabelId))
        .filter((id): id is string => Boolean(id));

    yield* MessageStore.detachLabels({
      accountId: ctx.accountId,
      gmailMessageIds: args.gmailMessageIds,
      labelIds: idsOf(removeGmailLabels),
    });
    yield* MessageStore.attachLabels({
      accountId: ctx.accountId,
      gmailMessageIds: args.gmailMessageIds,
      labelIds: idsOf(addGmailLabels),
    });

    if (args.action === "archive" || args.action === "trash") {
      yield* MessageStore.setFlagsForMessages({
        accountId: ctx.accountId,
        gmailMessageIds: args.gmailMessageIds,
        flags: args.action === "archive" ? { isArchived: true } : { isTrashed: true },
      });
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

    const [unreadLabel] = yield* LabelStore.byGmailIds({
      accountId: ctx.accountId,
      gmailLabelIds: ["UNREAD"],
    });

    yield* tryAsync(() =>
      ctx.gmail.batchModifyLabels({
        account: ctx.accountEmail,
        messageIds: [ctx.gmailMessageId],
        add: args.read ? undefined : ["UNREAD"],
        remove: args.read ? ["UNREAD"] : undefined,
      }),
    );

    if (unreadLabel) {
      const write = args.read ? MessageStore.detachLabels : MessageStore.attachLabels;
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

export interface LatestTriageForMessage {
  triageId: string;
  priority: "high" | "medium" | "low";
  existingLabelSuggestions: {
    labelId: string;
    name: string;
    status: "pending" | "applied" | "dismissed";
  }[];
  newLabelSuggestions: {
    suggestionId: string;
    name: string;
    status: "pending" | "applied" | "dismissed";
  }[];
}

export const getLatestTriageForMessageEffect = (args: {
  accountId: string;
  gmailMessageId: string;
}): Effect.Effect<LatestTriageForMessage | null, never, TriageStore> =>
  Effect.gen(function* () {
    const [latest] = yield* TriageStore.historyFor(args);
    if (!latest) return null;

    const [existing, proposed] = yield* Effect.all([
      TriageStore.existingSuggestionsFor([latest.id]),
      TriageStore.newSuggestionsFor([latest.id]),
    ]);

    return {
      triageId: latest.id,
      priority: latest.priority,
      existingLabelSuggestions: existing.map((e) => ({
        labelId: e.labelId,
        name: e.name,
        status: e.status,
      })),
      newLabelSuggestions: proposed.map((p) => ({
        suggestionId: p.suggestionId,
        name: p.name,
        status: p.status,
      })),
    };
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

export async function applySuggestions(
  input: ApplySuggestionsInput,
): Promise<ApplySuggestionsResult> {
  return runWithStores(applySuggestionsEffect(input));
}

export async function dismissSuggestions(
  input: DismissSuggestionsInput,
): Promise<DismissSuggestionsResult> {
  return runWithStores(dismissSuggestionsEffect(input));
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

export async function getLatestTriageForMessage(args: {
  accountId: string;
  gmailMessageId: string;
}): Promise<LatestTriageForMessage | null> {
  return runWithStores(getLatestTriageForMessageEffect(args));
}
