import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "./client";
import { queryKeys } from "./queries";
import type { GoogleOAuthConfigStatus, GoogleOAuthSaveResult, SaveGoogleOAuthInput } from "./types";

// The server's Google OAuth client (#120, A15): read by the onboarding gate on
// every load, and written from the gate's Google step and the Settings card.
//
// The read stays on `/auth/google/config`, which answers the same status as
// `/settings/google-oauth`; the writes go to the settings route, the only one
// with a PUT and a DELETE. The secret travels one way, in a PUT body, and is
// never held in the cache: what comes back is a masked hint at most.

export function googleOAuthConfigQueryOptions() {
  return {
    queryKey: queryKeys.googleOAuthConfig,
    queryFn: async () => apiFetch<GoogleOAuthConfigStatus>({ path: "/auth/google/config" }),
  };
}

export function useGoogleOAuthConfig() {
  return useQuery(googleOAuthConfigQueryOptions());
}

/** The sentence after a change of client disconnected mailboxes, or null. */
export const reconnectNotice = (reconnectRequired: number): string | null =>
  reconnectRequired > 0
    ? `${reconnectRequired} ${reconnectRequired === 1 ? "mailbox was" : "mailboxes were"} disconnected; each has to reconnect.`
    : null;

/**
 * Writes the answer into the cache — the gate reads it, so a saved client moves
 * it on without a round trip — then re-reads the status and the accounts, whose
 * grants a different client has just stranded.
 */
async function settle(qc: QueryClient, result: GoogleOAuthSaveResult) {
  qc.setQueryData<GoogleOAuthConfigStatus>(queryKeys.googleOAuthConfig, result);
  const notice = reconnectNotice(result.reconnectRequired);
  if (notice) toast(notice);
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.googleOAuthConfig }),
    qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  ]);
}

export function useSaveGoogleOAuthClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveGoogleOAuthInput) =>
      apiFetch<GoogleOAuthSaveResult>({
        path: "/settings/google-oauth",
        method: "PUT",
        body: input,
      }),
    onSuccess: (result) => settle(qc, result),
  });
}

/** Forgets the stored client; the environment's, if any, is in effect again. */
export function useForgetGoogleOAuthClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiFetch<GoogleOAuthSaveResult>({ path: "/settings/google-oauth", method: "DELETE" }),
    onSuccess: (result) => settle(qc, result),
  });
}
