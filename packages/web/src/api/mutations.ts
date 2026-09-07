import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage } from "./apiErrorMessage";
import { apiFetch } from "./client";
import { queryKeys } from "./queries";
import type {
  EditedPromo,
  ExtractPromosResult,
  ListedMessage,
  MessageDetail,
  MessageLabel,
  ModelSettings,
  PromoFieldsPatch,
  PromoSuggestion,
  SavePromoResult,
  SuggestFilterForMessageResult,
  TriageBatchSettings,
} from "./types";
import {
  messageMutationOptions,
  sameMessage,
  type MessageMutationConfig,
  type MessageMutationContext,
  type MessageMutationTarget,
  type OptimisticPlan,
} from "./messageMutation";
import { updateScheduleMutationOptions } from "./schedule.hooks";

/**
 * The message mutations, each as a plain options object plus the hook that
 * feeds it a query client.
 *
 * The options seam is what makes them testable without a DOM render (the same
 * one `schedule.hooks.ts` uses), and `messageMutationOptions` is what keeps them
 * short: cancelling, snapshotting, rolling back, re-reading and the two shapes
 * the messages cache holds are its business, not theirs. What is left here is
 * the route, the optimistic shape of a row, and anything else the change
 * invalidates.
 */

export interface MessageActionResult {
  ok: true;
  threadId: string;
}

export interface MessageActionInput {
  accountId: string;
  gmailMessageId: string;
}

// Archiving and trashing act on the whole thread (Gmail does, and the backend
// marks every message in it), so the siblings of the message acted on have to
// go with it — otherwise they re-appear on the next refetch, seconds after the
// row above them vanished. This is why an optimistic plan is handed every
// cached message: the siblings live in other queries and other pages.
const hideWholeThread: OptimisticPlan<MessageActionInput> = (input, cached) => {
  const threadIds = new Set(
    cached.filter((m) => sameMessage(m, input)).map((m) => m.gmailThreadId),
  );
  return (m) => (m.accountId === input.accountId && threadIds.has(m.gmailThreadId) ? null : m);
};

/**
 * The same options, plus a sentence for the user when the request failed.
 *
 * Archiving and trashing are the two actions whose caller is gone by the time
 * the answer arrives: from the detail page both leave immediately (#145), and
 * react-query drops the callbacks passed to `mutate` once their component has
 * unmounted. So the notice hangs off the mutation, which the cache calls
 * whether or not anyone is still listening — the rollback puts the row back in
 * the list either way, and this is what says why it came back.
 */
function announcingFailure<TInput extends MessageMutationTarget, TResult, TSide = never>(
  qc: QueryClient,
  whenItFails: string,
  config: MessageMutationConfig<TInput, TSide>,
) {
  const options = messageMutationOptions<TInput, TResult, TSide>(qc, config);
  return {
    ...options,
    onError: (err: unknown, input: TInput, context?: MessageMutationContext) => {
      options.onError(err, input, context);
      toast.error(`${whenItFails}: ${apiErrorMessage(err)}`);
    },
  };
}

/**
 * The inbox's promo suggestions, re-read whenever a mail leaves the inbox
 * (#160).
 *
 * An unsaved detection follows its message — a promo whose mail was archived,
 * trashed or removed is not suggested — and the server applies that on every
 * read, so the only thing that can contradict it is a stale cache. It is a
 * separate key rather than a branch of `messages` on purpose (the two have
 * different lifetimes), which is exactly why the lists' own invalidation does
 * not reach it: after a removal they are authoritative and are not re-read at
 * all.
 */
const PROMO_SUGGESTIONS = () => [["promo-suggestions"]] as const;

export function archiveMessageMutationOptions(qc: QueryClient) {
  return announcingFailure<MessageActionInput, MessageActionResult>(
    qc,
    "Could not archive message",
    {
      request: (input) => ({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/archive`,
        method: "POST",
      }),
      optimistic: hideWholeThread,
      alsoInvalidate: PROMO_SUGGESTIONS,
      listsAreAuthoritative: true,
    },
  );
}

export function useArchiveMessage() {
  const qc = useQueryClient();
  return useMutation(archiveMessageMutationOptions(qc));
}

/**
 * Trashing a message.
 *
 * Every caller — the inbox row, the verification-code pill, the message-detail
 * confirmation panel — goes through this, so they share one route, one bearer
 * token and one set of invalidations.
 */
export function trashMessageMutationOptions(qc: QueryClient) {
  return announcingFailure<MessageActionInput, MessageActionResult>(
    qc,
    "Could not delete message",
    {
      request: (input) => ({
        path: `/messages/${input.accountId}/${input.gmailMessageId}`,
        method: "DELETE",
      }),
      optimistic: hideWholeThread,
      alsoInvalidate: PROMO_SUGGESTIONS,
      // The *lists* aren't re-read on success — the optimistic removal is the
      // truth there. The detail query is a different matter, and the factory
      // invalidates it either way: nothing optimistic touches it, so without that
      // the cached message keeps reporting `isTrashed: false` to whoever
      // navigates back to it.
      listsAreAuthoritative: true,
    },
  );
}

export function useTrashMessage() {
  const qc = useQueryClient();
  return useMutation(trashMessageMutationOptions(qc));
}

export interface SavePromoInput extends MessageActionInput {
  /** The promo being saved — our own id, not Gmail's. */
  promoId: string;
}

/**
 * Saving a promo and getting its mail out of the inbox, in one press (#161).
 *
 * The server does both, in that order — the promo with its copy of the mail
 * first, the trash second — so what is left here is the choreography, and this
 * is the one mutation where both query keys move together: the card leaves the
 * suggestions through `optimisticSide` and the mail leaves the lists through
 * the same thread-wide removal a trash uses. Both are snapshotted and both are
 * put back by the factory when the save is refused, which is why neither is a
 * second copy of that machinery.
 *
 * A promo that is not the one saved but hangs off the same mail goes too: the
 * mail is on its way to the trash, and a suggestion follows its mail.
 */
export function savePromoMutationOptions(qc: QueryClient) {
  const options = announcingFailure<SavePromoInput, SavePromoResult, PromoSuggestion>(
    qc,
    "Could not save promo code",
    {
      request: (input) => ({
        path: `/promo-codes/${input.promoId}/save`,
        method: "POST",
      }),
      optimistic: hideWholeThread,
      optimisticSide: {
        key: ["promo-suggestions"],
        item: (input) => (promo) =>
          promo.accountId === input.accountId && promo.gmailMessageId === input.gmailMessageId
            ? null
            : promo,
      },
      alsoInvalidate: PROMO_SUGGESTIONS,
      listsAreAuthoritative: true,
    },
  );

  return {
    ...options,
    // The save survived, the trash did not: the promo is kept and the mail is
    // still in the mailbox, so the row the click removed has to come back and
    // the user has to be told what is left to do.
    onSuccess: (result: SavePromoResult, input: SavePromoInput) => {
      options.onSuccess(result, input);
      if (result.trashedThreadId === null) {
        toast.warning("Promo saved, but the email could not be deleted.");
        qc.invalidateQueries({ queryKey: ["messages"] });
      }
    },
  };
}

export function useSavePromo() {
  const qc = useQueryClient();
  return useMutation(savePromoMutationOptions(qc));
}

export interface UpdateSavedPromoInput {
  /** Our own id — the promo's, never the mail's. */
  promoId: string;
  fields: PromoFieldsPatch;
}

/**
 * Correcting what the extraction guessed (#164).
 *
 * Deliberately **not** optimistic, unlike every message action beside it, and
 * for a reason rather than by omission: which of the page's two sections a
 * promo is in — and where inside it — is `listSavedPromos`' rule, computed from
 * the edited expiry against the server's clock. Writing the answer into the
 * cache here would mean re-deriving "active or expired" in the browser, a
 * second copy of a rule that already has one home. So the page is re-read, and
 * a corrected deadline moves the row with nothing else to keep in step.
 *
 * A refusal therefore needs no rollback: nothing was written, the row is still
 * saying what it said, and the toast is what explains why the edit did not
 * take.
 */
export function updateSavedPromoMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (input: UpdateSavedPromoInput) =>
      apiFetch<EditedPromo>({
        path: `/promo-codes/${input.promoId}`,
        method: "PATCH" as const,
        body: input.fields,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedPromos });
    },
    onError: (err: unknown) => {
      toast.error(`Could not save the changes: ${apiErrorMessage(err)}`);
    },
  };
}

export function useUpdateSavedPromo() {
  const qc = useQueryClient();
  return useMutation(updateSavedPromoMutationOptions(qc));
}

export interface DeleteSavedPromoInput {
  promoId: string;
}

export interface DeleteSavedPromoResult {
  ok: true;
  id: string;
}

/**
 * Taking a saved promo off the page (#164).
 *
 * The only thing that removes a promo row anywhere: nothing expires itself
 * away, so a lapsed promo stays as the record of what a shop offered until
 * someone asks for it to go.
 *
 * Re-read rather than removed optimistically, like the edit above. A delete is
 * a deliberate act behind a confirmation rather than a click in a stream of
 * triage, so there is no gesture for the interface to keep up with — and a
 * refusal leaves the row exactly where it was, with nothing to put back.
 */
export function deleteSavedPromoMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (input: DeleteSavedPromoInput) =>
      apiFetch<DeleteSavedPromoResult>({
        path: `/promo-codes/${input.promoId}`,
        method: "DELETE" as const,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedPromos });
    },
    onError: (err: unknown) => {
      toast.error(`Could not delete the promo code: ${apiErrorMessage(err)}`);
    },
  };
}

export function useDeleteSavedPromo() {
  const qc = useQueryClient();
  return useMutation(deleteSavedPromoMutationOptions(qc));
}

export interface ExtractPromosInput extends MessageActionInput {}

/**
 * Asking the model for this message's promo codes, by hand (#165).
 *
 * Not optimistic, and here that is not a preference but the shape of the thing:
 * the whole content of this mutation is an answer nobody can predict. There is
 * no gesture for the interface to keep up with — the user pressed a button and
 * is waiting for what comes back — so the pending flag is the feedback and the
 * result is the payload.
 *
 * The suggestions key is invalidated because the run rewrote this message's
 * unsaved rows: whatever the inbox strip is holding for this mail is now the
 * previous answer. The panel reads the result directly rather than that cache,
 * since the inbox's read is scoped to an account and a period this page has no
 * reason to satisfy.
 *
 * A refusal is a toast and nothing else. Both classes reach here — a provider
 * that cannot run, and a model that answered something unusable — and
 * `apiErrorMessage` is what turns the first into the sentence that sends
 * someone to Settings.
 */
export function extractPromosMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (input: ExtractPromosInput) =>
      apiFetch<ExtractPromosResult>({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/extract-promos`,
        method: "POST" as const,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promo-suggestions"] });
    },
    onError: (err: unknown) => {
      toast.error(`Could not extract promo codes: ${apiErrorMessage(err)}`);
    },
  };
}

export function useExtractPromos() {
  const qc = useQueryClient();
  return useMutation(extractPromosMutationOptions(qc));
}

export interface SetMessageReadInput extends MessageActionInput {
  read: boolean;
}

export interface SetMessageReadResult {
  ok: true;
  read: boolean;
}

const UNREAD_LABEL: MessageLabel = {
  id: "__unread__",
  name: "UNREAD",
  gmailLabelId: "UNREAD",
  colorBg: null,
  colorFg: null,
};

/**
 * The three label edits below are written once for both shapes.
 *
 * A row and the open message disagree about almost everything — a priority, a
 * pending suggestion — but they hold the same `labels` array, and it is the one
 * an action from the detail page most often moves. Generic over the carrier so
 * the list plan and the detail plan share the edit rather than each spelling it.
 */
type Labelled = { labels: MessageLabel[] };

/** Add or drop the UNREAD label, leaving a message that already reads that way alone. */
function withUnread<T extends Labelled>(m: T, unread: boolean): T {
  const hasUnread = m.labels.some((l) => l.name === "UNREAD");
  if (unread === hasUnread) return m;
  return unread
    ? { ...m, labels: [UNREAD_LABEL, ...m.labels] }
    : { ...m, labels: m.labels.filter((l) => l.name !== "UNREAD") };
}

function withoutLabel<T extends Labelled>(m: T, labelId: string): T {
  return { ...m, labels: m.labels.filter((l) => l.id !== labelId) };
}

/** Attach a label already known by id, leaving one the message carries alone. */
function withLabel<T extends Labelled>(m: T, label: MessageLabel): T {
  return m.labels.some((l) => l.id === label.id) ? m : { ...m, labels: [...m.labels, label] };
}

export function setMessageReadMutationOptions(qc: QueryClient) {
  return messageMutationOptions<SetMessageReadInput, SetMessageReadResult>(qc, {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/read`,
      method: "POST",
      body: { read: input.read },
    }),
    optimistic: (input) => (m) => (sameMessage(m, input) ? withUnread(m, !input.read) : m),
    optimisticDetail: (input) => (d) => withUnread(d, !input.read),
  });
}

export function useSetMessageRead() {
  const qc = useQueryClient();
  return useMutation(setMessageReadMutationOptions(qc));
}

export interface GenerateReplyInput extends MessageActionInput {
  prompt: string;
}

export interface GenerateReplyResult {
  subject: string;
  body: string;
  model: string;
  runId: string;
}

// Drafting a reply changes nothing — no row moves, no label appears, and the
// message is exactly as it was — so this is a request and no choreography.
export function generateReplyMutationOptions() {
  return {
    mutationFn: async (input: GenerateReplyInput) =>
      apiFetch<GenerateReplyResult>({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/generate-reply`,
        method: "POST",
        body: { prompt: input.prompt },
      }),
  };
}

export function useGenerateReply() {
  return useMutation(generateReplyMutationOptions());
}

export interface SendReplyInput extends MessageActionInput {
  subject: string;
  body: string;
  /**
   * Edited in the compose window (#96). Omitted, the server addresses the reply
   * from the stored message as it always did — which is what the CLI relies on.
   */
  to?: string[];
  cc?: string[];
}

export interface SendReplyResult {
  ok: true;
  sentMessageId: string;
}

// Sending has no optimistic shape — the sent message is the server's to
// describe — so the lists and the thread are simply re-read afterwards.
export function sendReplyMutationOptions(qc: QueryClient) {
  return messageMutationOptions<SendReplyInput, SendReplyResult>(qc, {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/send-reply`,
      method: "POST",
      body: {
        subject: input.subject,
        body: input.body,
        ...(input.to ? { to: input.to } : {}),
        ...(input.cc ? { cc: input.cc } : {}),
      },
    }),
  });
}

export function useSendReply() {
  const qc = useQueryClient();
  return useMutation(sendReplyMutationOptions(qc));
}

export type BatchMessageAction = "read" | "unread" | "archive" | "trash" | "label";

/** The four that carry nothing — every action but the one with a payload. */
export type BatchFlagAction = Exclude<BatchMessageAction, "label">;

/**
 * Acting on a selection (#147).
 *
 * The four flag actions are the action alone; applying a label needs to say
 * which one. It travels as the whole label rather than an id because both ends
 * of the mutation want it: the request sends `label.id`, and the optimistic
 * plan has to draw the chip — name and colours included — before the server has
 * said anything.
 */
export type BatchMessageActionInput = {
  accountId: string;
  gmailMessageIds: string[];
} & ({ action: BatchFlagAction } | { action: "label"; label: ListedMessage["labels"][number] });

export interface BatchMessageActionResult {
  ok: true;
  action: BatchMessageAction;
  count: number;
}

export function batchMessageActionMutationOptions(qc: QueryClient) {
  return messageMutationOptions<BatchMessageActionInput, BatchMessageActionResult>(qc, {
    request: (input) => ({
      path: "/messages/batch",
      method: "POST",
      body: {
        accountId: input.accountId,
        gmailMessageIds: input.gmailMessageIds,
        action: input.action,
        ...(input.action === "label" ? { labelId: input.label.id } : {}),
      },
    }),
    optimistic: (input) => {
      const ids = new Set(input.gmailMessageIds);
      const selected = (m: ListedMessage) =>
        m.accountId === input.accountId && ids.has(m.gmailMessageId);
      if (input.action === "archive" || input.action === "trash") {
        return (m) => (selected(m) ? null : m);
      }
      // A batch labels the messages it names, not their threads, so the rows
      // stay put and only the ones selected gain the chip.
      if (input.action === "label") {
        return (m) => (selected(m) ? withLabel(m, input.label) : m);
      }
      return (m) => (selected(m) ? withUnread(m, input.action === "unread") : m);
    },
    // A bulk read/unread changes no suggestion, but the key is coarse and the
    // refetch is one request — cheaper than a second branch on the action.
    alsoInvalidate: PROMO_SUGGESTIONS,
    // Read/unread is authoritative here for the same reason a removal is: a
    // success refetch would race the other mutations a bulk selection fires.
    listsAreAuthoritative: true,
  });
}

export function useBatchMessageAction() {
  const qc = useQueryClient();
  return useMutation(batchMessageActionMutationOptions(qc));
}

export type ApplyLabelSuggestionInput = MessageActionInput & {
  triageId: string;
} & (
    | {
        kind: "existing";
        labelId: string;
        name: string;
        colorBg: string | null;
        colorFg: string | null;
      }
    | { kind: "new"; suggestionId: string }
  );

export interface ApplyLabelSuggestionResult {
  ok: true;
  appliedExistingLabelIds: string[];
  createdLabels: { suggestionId: string; labelId: string; name: string }[];
  attached: { gmailLabelId: string; name: string }[];
}

type TriageRun = MessageDetail["triageHistory"][number];

/**
 * Mark the accepted suggestion settled on the run it was accepted from.
 *
 * The detail's pills are the run's suggestions filtered by `status`, so this is
 * what makes one disappear — and it is scoped to `triageId` because an older run
 * that proposed the same label was not acted on and still reads as pending.
 */
function withSuggestionApplied(run: TriageRun, input: ApplyLabelSuggestionInput): TriageRun {
  if (run.id !== input.triageId) return run;
  return input.kind === "existing"
    ? {
        ...run,
        existingLabelSuggestions: run.existingLabelSuggestions.map((s) =>
          s.labelId === input.labelId ? { ...s, status: "applied" } : s,
        ),
      }
    : {
        ...run,
        newLabelSuggestions: run.newLabelSuggestions.map((s) =>
          s.suggestionId === input.suggestionId ? { ...s, status: "applied" } : s,
        ),
      };
}

/**
 * Accepting one label suggestion.
 *
 * An existing label can be attached optimistically because it is already
 * known; a new one is created server-side, so only the suggestion that produced
 * it can be cleared. Either way the account's label list is stale too.
 */
export function applyLabelSuggestionMutationOptions(qc: QueryClient) {
  return messageMutationOptions<ApplyLabelSuggestionInput, ApplyLabelSuggestionResult>(qc, {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/apply-suggestions`,
      method: "POST",
      body: {
        triageId: input.triageId,
        acceptExistingLabelIds: input.kind === "existing" ? [input.labelId] : undefined,
        acceptNewSuggestionIds: input.kind === "new" ? [input.suggestionId] : undefined,
      },
    }),
    optimistic: (input) => (m) => {
      if (!sameMessage(m, input)) return m;
      if (input.kind === "new") {
        return {
          ...m,
          pendingSuggestions: {
            ...m.pendingSuggestions,
            new: m.pendingSuggestions.new.filter((s) => s.suggestionId !== input.suggestionId),
          },
        };
      }
      return {
        ...withLabel(m, {
          id: input.labelId,
          name: input.name,
          gmailLabelId: input.labelId,
          colorBg: input.colorBg,
          colorFg: input.colorFg,
        }),
        pendingSuggestions: {
          ...m.pendingSuggestions,
          existing: m.pendingSuggestions.existing.filter((s) => s.labelId !== input.labelId),
        },
      };
    },
    optimisticDetail: (input) => (d) => {
      const settled = {
        ...d,
        triageHistory: d.triageHistory.map((run) => withSuggestionApplied(run, input)),
      };
      return input.kind === "new"
        ? settled
        : withLabel(settled, {
            id: input.labelId,
            name: input.name,
            gmailLabelId: input.labelId,
            colorBg: input.colorBg,
            colorFg: input.colorFg,
          });
    },
    alsoInvalidate: (input) => [queryKeys.labels(input.accountId)],
  });
}

export function useApplyLabelSuggestion() {
  const qc = useQueryClient();
  return useMutation(applyLabelSuggestionMutationOptions(qc));
}

export interface SuggestionBatchInput extends MessageActionInput {
  triageId: string;
  /** Every pending existing suggestion of the triage, so apply-all is one call. */
  existingLabelIds: string[];
  /** Every pending new suggestion of the triage. */
  newSuggestionIds: string[];
}

/** Both batch verbs empty the row's pill, so the list plan is the same one. */
const withSuggestionsCleared =
  (input: SuggestionBatchInput) =>
  (m: ListedMessage): ListedMessage =>
    sameMessage(m, input) ? { ...m, pendingSuggestions: { existing: [], new: [] } } : m;

/** The detail spells a suggestion as a `status` on its run, so settling one is a
 *  rewrite of that field rather than a removal (#145). */
const withRunSettled =
  (input: SuggestionBatchInput, status: "applied" | "dismissed") =>
  (d: MessageDetail): MessageDetail => ({
    ...d,
    triageHistory: d.triageHistory.map((run) =>
      run.id === input.triageId
        ? {
            ...run,
            existingLabelSuggestions: run.existingLabelSuggestions.map((s) =>
              s.status === "pending" ? { ...s, status } : s,
            ),
            newLabelSuggestions: run.newLabelSuggestions.map((s) =>
              s.status === "pending" ? { ...s, status } : s,
            ),
          }
        : run,
    ),
  });

/**
 * Accepting a triage's whole suggestion set in one press.
 *
 * The route already takes both id arrays, so this is one request rather than a
 * loop of the single-suggestion mutation — which matters for the optimistic
 * write as much as the network: the pill empties once instead of flickering down
 * a count. The labels a new suggestion creates are named server-side, so the
 * account's label list is invalidated the way the single apply does it.
 */
export function applyAllSuggestionsMutationOptions(qc: QueryClient) {
  return messageMutationOptions<SuggestionBatchInput, ApplyLabelSuggestionResult>(qc, {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/apply-suggestions`,
      method: "POST",
      body: {
        triageId: input.triageId,
        acceptExistingLabelIds: input.existingLabelIds,
        acceptNewSuggestionIds: input.newSuggestionIds,
      },
    }),
    optimistic: withSuggestionsCleared,
    optimisticDetail: (input) => withRunSettled(input, "applied"),
    alsoInvalidate: (input) => [queryKeys.labels(input.accountId)],
  });
}

export function useApplyAllSuggestions() {
  const qc = useQueryClient();
  return useMutation(applyAllSuggestionsMutationOptions(qc));
}

/**
 * Turning a triage's whole suggestion set down.
 *
 * Declining changes what miel offers, never what Gmail holds, so unlike its
 * apply counterpart it attaches no label and leaves the account's label list
 * alone — the only thing that moves is the pill going away.
 */
export function dismissAllSuggestionsMutationOptions(qc: QueryClient) {
  return messageMutationOptions<SuggestionBatchInput, { ok: true; triageId: string }>(qc, {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/dismiss-suggestions`,
      method: "POST",
      body: { triageId: input.triageId },
    }),
    optimistic: withSuggestionsCleared,
    optimisticDetail: (input) => withRunSettled(input, "dismissed"),
  });
}

export function useDismissAllSuggestions() {
  const qc = useQueryClient();
  return useMutation(dismissAllSuggestionsMutationOptions(qc));
}

export interface RemoveMessageLabelInput extends MessageActionInput {
  labelId: string;
}

export interface RemoveMessageLabelResult {
  ok: true;
  added: { labelId: string; gmailLabelId: string; name: string }[];
  removed: { labelId: string; gmailLabelId: string; name: string }[];
}

export function removeMessageLabelMutationOptions(qc: QueryClient) {
  return messageMutationOptions<RemoveMessageLabelInput, RemoveMessageLabelResult>(qc, {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/labels`,
      method: "POST",
      body: { remove: [input.labelId] },
    }),
    optimistic: (input) => (m) => (sameMessage(m, input) ? withoutLabel(m, input.labelId) : m),
    optimisticDetail: (input) => (d) => withoutLabel(d, input.labelId),
  });
}

export function useRemoveMessageLabel() {
  const qc = useQueryClient();
  return useMutation(removeMessageLabelMutationOptions(qc));
}

export interface SetMessagePriorityInput extends MessageActionInput {
  priority: "high" | "medium" | "low";
}

export function setMessagePriorityMutationOptions(qc: QueryClient) {
  return messageMutationOptions<SetMessagePriorityInput, { ok: true }>(qc, {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/priority`,
      method: "POST",
      body: { priority: input.priority },
    }),
    optimistic: (input) => (m) => (sameMessage(m, input) ? { ...m, priority: input.priority } : m),
    // The detail spells the same fact differently: its priority is the newest
    // triage run's, which is what the panel's chip reads. A message with no run
    // has nowhere to put one — it shows the untriaged notice instead.
    optimisticDetail: (input) => (d) => {
      const [latest, ...older] = d.triageHistory;
      return latest
        ? { ...d, triageHistory: [{ ...latest, priority: input.priority }, ...older] }
        : d;
    },
  });
}

export function useSetMessagePriority() {
  const qc = useQueryClient();
  return useMutation(setMessagePriorityMutationOptions(qc));
}

export interface SuggestSimilarFilterInput extends MessageActionInput {
  prompt?: string;
}

// The suggestion lands in the filters list, not on the message: nothing about
// the message changed, so neither the lists nor the detail are re-read. Another
// request with no choreography to own.
export function suggestSimilarFilterMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (input: SuggestSimilarFilterInput) =>
      apiFetch<SuggestFilterForMessageResult>({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/filter-suggest`,
        method: "POST" as const,
        body: input.prompt ? { prompt: input.prompt } : {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["filters"] });
    },
  };
}

export function useSuggestSimilarFilter() {
  const qc = useQueryClient();
  return useMutation(suggestSimilarFilterMutationOptions(qc));
}

// A patch of the picker: either half of a task's pair, for any of the three
// tasks. Naming a provider and no model is meaningful — the server then picks
// that vendor's default (#105).
export type UpdateSettingsInput = Partial<ModelSettings>;

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSettingsInput) =>
      apiFetch<ModelSettings>({
        path: "/settings",
        method: "PUT",
        body: input,
      }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.settings, data);
    },
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation(updateScheduleMutationOptions(qc));
}

export interface UpdateTriageBatchSettingsInput {
  batchSize?: number;
  batchConcurrency?: number;
}

export function useUpdateTriageBatchSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTriageBatchSettingsInput) =>
      apiFetch<TriageBatchSettings>({
        path: "/settings/triage-batch",
        method: "PUT",
        body: input,
      }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.triageBatchSettings, data);
    },
  });
}

export interface RemoveAccountInput {
  accountId: string;
}

/**
 * Disconnect an account and forget its synced data.
 *
 * The removal reaches well past the accounts list — messages, labels, filters
 * and logs are all account-scoped — so this invalidates each of those key
 * prefixes rather than only `accounts`, otherwise the message list keeps
 * rendering mail belonging to a mailbox that no longer exists.
 */
export function useRemoveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RemoveAccountInput) =>
      apiFetch<{ account: { id: string; email: string } }>({
        path: `/accounts/${input.accountId}`,
        method: "DELETE",
      }),
    onSuccess: async () => {
      // `accounts` is also the prefix for per-account labels.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.accounts }),
        qc.invalidateQueries({ queryKey: ["messages"] }),
        qc.invalidateQueries({ queryKey: ["filters"] }),
        qc.invalidateQueries({ queryKey: ["logs"] }),
      ]);
    },
  });
}
