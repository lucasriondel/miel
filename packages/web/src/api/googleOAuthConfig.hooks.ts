import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { queryKeys } from "./queries";
import type { GoogleOAuthConfigStatus } from "./types";

// A pure option factory for the server's Google OAuth configuration (#120),
// extracted so the request shape can be unit-tested without a DOM render
// (mirrors claudeCodeToken.hooks.ts).
//
// This one is read-only and has no mutation beside it, unlike every other
// onboarding status: the three `GOOGLE_*` variables are the server's
// environment, so there is nothing the browser could PUT.

export function googleOAuthConfigQueryOptions() {
  return {
    queryKey: queryKeys.googleOAuthConfig,
    queryFn: async () => apiFetch<GoogleOAuthConfigStatus>({ path: "/auth/google/config" }),
  };
}

export function useGoogleOAuthConfig() {
  return useQuery(googleOAuthConfigQueryOptions());
}
