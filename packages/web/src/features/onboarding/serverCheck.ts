import { useQuery } from "@tanstack/react-query";
import { ApiError, apiFetch } from "../../api/client";
import type { ServerCheckStatus } from "./onboardingStep";

/**
 * Can this page talk to its API? (The gate's first step.)
 *
 * The API's address and secret are baked into the build (`VITE_API_BASE`,
 * `VITE_API_SECRET`), so there is nothing to type here — but there are two ways
 * the pair can be wrong, and before this step both looked like an app that
 * simply never loaded anything:
 *
 * - **unauthorized** — the API answered 401: the secret this page was built
 *   with is not the server's `API_SECRET`.
 * - **unreachable** — nothing answered: `fetch` itself failed, or a proxy in
 *   front of the API answered for it (a 502/503/504, or a 500 that is not the
 *   API's own JSON — the dev proxy's answer when the API is down).
 *
 * Anything else is rethrown, so the query errors and the gate stays shut as it
 * does for every other unsettled question. A 404 counts as `ok`: something
 * behind the secret answered, which is all this step asks.
 */
export function classifyServerCheckError(error: unknown): ServerCheckStatus | null {
  if (error instanceof TypeError) return "unreachable";
  if (!(error instanceof ApiError)) return null;
  if (error.status === 401) return "unauthorized";
  if (error.status === 404) return "ok";
  if (error.status >= 502 && error.status <= 504) return "unreachable";
  const answeredJson = typeof error.body === "object" && error.body !== null;
  if (error.status === 500 && !answeredJson) return "unreachable";
  return null;
}

export const serverCheckQueryKey = ["auth-check"] as const;

export async function checkServer(): Promise<{ status: ServerCheckStatus }> {
  try {
    await apiFetch<{ ok: true }>({ path: "/auth/check" });
    return { status: "ok" };
  } catch (error) {
    const status = classifyServerCheckError(error);
    if (status === null) throw error;
    return { status };
  }
}

/**
 * `GET /auth/check`, asked only when it can matter.
 *
 * `enabled` is the gate's other evidence: the Google-config request every page
 * load makes anyway. While that one answers, the server is reachable and the
 * secret is right, so a second request would only cost a round trip; when it
 * fails, this is what says why. No retry — the step has its own "Check again".
 */
export function useServerCheck(enabled: boolean) {
  return useQuery({
    queryKey: serverCheckQueryKey,
    queryFn: checkServer,
    enabled,
    retry: false,
  });
}
