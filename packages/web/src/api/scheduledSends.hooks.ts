import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { queryKeys } from "./queries";
import type { ScheduledSendView, ScheduledSendsResponse } from "./types";

/**
 * Mail miel holds and sends itself later (A12). Created by the compose window
 * (`POST /compose/scheduled`); listed, moved, retried and cancelled from here.
 *
 * Exports, for the compose window and the Scheduled page:
 * - {@link useScheduledSends} — the list, polled while something is due to go.
 * - {@link cancelScheduledSend} / {@link useCancelScheduledSend} — `DELETE`.
 * - {@link rescheduleSend} / {@link useRescheduleSend} — `PATCH { sendAt }`,
 *   which also retries a failed send.
 *
 * The mutations re-read every `["scheduled-sends"]` list and say nothing:
 * which words a cancel deserves depends on where it was pressed (a toast's
 * Undo or a row's button), so the caller says them.
 */

const ROOT = ["scheduled-sends"] as const;

/** How often the list is re-read while a send is waiting or going out. */
export const SCHEDULED_POLL_MS = 30_000;

/** Whether a list holds anything that will change on its own. */
const hasLiveItems = (data: ScheduledSendsResponse | undefined) =>
  data?.items.some((item) => item.status === "pending" || item.status === "sending") ?? false;

/**
 * The account's pending, sending and failed sends, soonest first; every
 * account's when `accountId` is omitted. There is no socket event for a send
 * going out, so the list polls every 30 s while any of it is still to go.
 */
export function useScheduledSends(accountId?: string) {
  return useQuery({
    queryKey: queryKeys.scheduledSends(accountId),
    queryFn: async () =>
      apiFetch<ScheduledSendsResponse>({
        path: "/compose/scheduled",
        query: { account: accountId },
      }),
    refetchInterval: (query) => (hasLiveItems(query.state.data) ? SCHEDULED_POLL_MS : false),
  });
}

/** Cancels a pending send. A send already going out answers 409 `scheduled_not_editable`. */
export const cancelScheduledSend = (id: string) =>
  apiFetch<ScheduledSendView>({ path: `/compose/scheduled/${id}`, method: "DELETE" });

/** Moves a pending send to `sendAt`, or gives a failed one another go at it. */
export const rescheduleSend = (id: string, sendAt: Date) =>
  apiFetch<ScheduledSendView>({
    path: `/compose/scheduled/${id}`,
    method: "PATCH",
    body: { sendAt: sendAt.toISOString() },
  });

export function useCancelScheduledSend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelScheduledSend(id),
    onSettled: () => qc.invalidateQueries({ queryKey: ROOT }),
  });
}

export interface RescheduleInput {
  id: string;
  sendAt: Date;
}

export function useRescheduleSend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sendAt }: RescheduleInput) => rescheduleSend(id, sendAt),
    onSettled: () => qc.invalidateQueries({ queryKey: ROOT }),
  });
}

/** Whether a refusal is the server saying the send is already on its way. */
export const isNotEditable = (err: unknown): boolean =>
  err instanceof Error && err.message === "scheduled_not_editable";
