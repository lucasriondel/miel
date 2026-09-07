import type { QueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { queryKeys } from "./queries";
import type { ClaudeCodeTokenStatus } from "./types";

// Pure option factories for the local provider's token, extracted so the request
// shapes and the cache writes can be unit-tested without a DOM render (mirrors
// providerCredential.hooks.ts, whose three routes these three match).
//
// Factories only: `useCredential` is where they are bound to a component, and
// the per-verb `use…` wrappers that used to sit here are gone with the tile
// family that called them (#135). A second binding is a second way to write a
// credential without the ladder the one hook exists to hold.
//
// `/settings/claude-code-token` rather than the read-only `/auth/claude/status`:
// both answer with the same status, but only this one can be written to, and a
// row that pastes and clears needs all three verbs on one key.
//
// The token travels one way. It goes out in a PUT body and is never stored in
// the query cache — what comes back, and all these ever hold, is presence plus
// a masked hint.

export interface SetClaudeCodeTokenInput {
  token: string;
}

export function claudeCodeTokenQueryOptions() {
  return {
    queryKey: queryKeys.claudeCodeToken,
    queryFn: async () => apiFetch<ClaudeCodeTokenStatus>({ path: "/settings/claude-code-token" }),
  };
}

export function setClaudeCodeTokenMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (input: SetClaudeCodeTokenInput) =>
      apiFetch<ClaudeCodeTokenStatus>({
        path: "/settings/claude-code-token",
        method: "PUT" as const,
        body: input,
      }),
    onSuccess: (data: ClaudeCodeTokenStatus) => {
      qc.setQueryData(queryKeys.claudeCodeToken, data);
    },
  };
}

export function deleteClaudeCodeTokenMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async () =>
      apiFetch<ClaudeCodeTokenStatus>({
        path: "/settings/claude-code-token",
        method: "DELETE" as const,
      }),
    // The response, not a cache reset: since #109 the row is the only source, so
    // what comes back is the unconfigured status rather than a fallback's.
    onSuccess: (data: ClaudeCodeTokenStatus) => {
      qc.setQueryData(queryKeys.claudeCodeToken, data);
    },
  };
}
