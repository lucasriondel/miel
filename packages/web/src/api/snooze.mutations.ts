import type { QueryClient } from "@tanstack/react-query";
import { MutationObserver, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { presetTimeLabel } from "../features/time/timePresets";
import { announcingFailure, hideWholeThread, type MessageActionInput } from "./mutations";
import type { OptimisticPlan } from "./messageMutation";

/**
 * Snooze and its way back (A13): the thread leaves the inbox now and comes back
 * at `until`, and Unsnooze — or the toast's Undo — brings it back at once.
 *
 * Beside `mutations.ts` rather than inside it, and built from its two pieces
 * (`announcingFailure`, `hideWholeThread`), so a snooze leaves the lists the way
 * an archive does and says so the way an archive does.
 */

export interface SnoozeInput extends MessageActionInput {
  /** When it comes back, as an ISO instant (`Date#toISOString`). */
  until: string;
}

export interface SnoozeResult {
  ok: true;
  threadId: string;
  snoozedUntil: string;
}

export interface UnsnoozeResult {
  ok: true;
  threadId: string;
}

/**
 * The inbox's thread leaves, as for an archive. A thread already snoozed is
 * only re-timed: it is in the Snoozed list, and moving its wake time keeps it
 * there.
 */
const snoozePlan: OptimisticPlan<SnoozeInput> = (input, cached) => {
  const hide = hideWholeThread(input, cached);
  const threadIds = new Set(
    cached
      .filter((m) => m.accountId === input.accountId && m.gmailMessageId === input.gmailMessageId)
      .map((m) => m.gmailThreadId),
  );
  return (m) => {
    const inThread = m.accountId === input.accountId && threadIds.has(m.gmailThreadId);
    if (inThread && m.snoozedUntil) return { ...m, snoozedUntil: input.until };
    return hide(m);
  };
};

/**
 * The Snoozed lists (any period, any account) and the suggestions a mail
 * carries. The query key's params match as a subset, so this reaches the view
 * and the sidebar's count whatever else they were asked with.
 */
const SNOOZE_READS = () => [["promo-suggestions"], ["messages", { snoozedOnly: true }]] as const;

function snoozeOptions(qc: QueryClient) {
  return announcingFailure<SnoozeInput, SnoozeResult>(qc, "Could not snooze message", {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/snooze`,
      method: "POST",
      body: { until: input.until },
    }),
    optimistic: snoozePlan,
    optimisticDetail: (input) => (detail) => ({ ...detail, snoozedUntil: input.until }),
    alsoInvalidate: SNOOZE_READS,
    // As for an archive: the removal is the truth, and re-reading every list on
    // success would race a second removal still in flight.
    listsAreAuthoritative: true,
  });
}

/**
 * Snoozing, with "Snoozed until Tue 08:00 · Undo". The toast and its Undo hang
 * off the mutation for archive's reason: from the reader the caller has
 * already left by the time the answer arrives.
 */
export function snoozeMessageMutationOptions(qc: QueryClient) {
  const options = snoozeOptions(qc);
  return {
    ...options,
    onSuccess: (data: SnoozeResult, input: SnoozeInput) => {
      options.onSuccess(data, input);
      const label = presetTimeLabel(new Date(data.snoozedUntil ?? input.until), new Date());
      toast(`Snoozed until ${label}`, {
        action: {
          label: "Undo",
          onClick: () => {
            void new MutationObserver(qc, unsnoozeMessageMutationOptions(qc)).mutate({
              accountId: input.accountId,
              gmailMessageId: input.gmailMessageId,
            });
          },
        },
      });
    },
  };
}

export function useSnoozeMessage() {
  const qc = useQueryClient();
  return useMutation(snoozeMessageMutationOptions(qc));
}

/**
 * Waking a snoozed thread now: back in the inbox, not marked unread (the user
 * is the one asking). It leaves the Snoozed list on the click; the inbox lists
 * are re-read, since the row coming back is not in them to write.
 */
export function unsnoozeMessageMutationOptions(qc: QueryClient) {
  return announcingFailure<MessageActionInput, UnsnoozeResult>(qc, "Could not unsnooze message", {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/snooze`,
      method: "DELETE",
    }),
    optimistic: (input, cached) => {
      const hide = hideWholeThread(input, cached);
      return (m) => (m.snoozedUntil ? hide(m) : m);
    },
    optimisticDetail: () => (detail) => ({ ...detail, snoozedUntil: null }),
    alsoInvalidate: () => [["promo-suggestions"]],
  });
}

export function useUnsnoozeMessage() {
  const qc = useQueryClient();
  return useMutation(unsnoozeMessageMutationOptions(qc));
}
