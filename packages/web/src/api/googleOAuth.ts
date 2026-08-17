import { toast } from "sonner";
import { DEFAULT_CONNECT_RETURN_TARGET, type ConnectReturnTarget } from "@miel/core/connectReturn";
import { apiFetch } from "./client";
import { apiErrorMessage } from "./apiErrorMessage";

/**
 * Starts the in-app Google OAuth flow: asks the API for a consent URL
 * (`GET /auth/google/start`) and navigates the browser there. Google redirects
 * back to the API callback, which stores the account and returns the browser
 * into the app with `?connected=<email>`.
 *
 * `returnTo` names where the flow started, since the callback lands outside the
 * SPA and can't tell: settings comes back to settings, the onboarding gate
 * comes back to the newly-connected account's inbox. The API narrows it to a
 * known target and keeps it server-side — the value never round-trips through
 * the browser, so it can't be used to redirect anywhere else.
 *
 * On failure it toasts and resolves `false`, so callers can restore their own
 * pending state. On success the page is already navigating away.
 */
export async function startGoogleOAuth(
  returnTo: ConnectReturnTarget = DEFAULT_CONNECT_RETURN_TARGET,
): Promise<boolean> {
  try {
    const { url } = await apiFetch<{ url: string }>({
      path: "/auth/google/start",
      query: { return: returnTo },
    });
    // Full-page navigation: the OAuth consent + callback round-trip happens
    // outside the SPA and returns us to `returnTo`'s page with a status param.
    window.location.assign(url);
    return true;
  } catch (e) {
    toast.error(`Could not start Google sign-in: ${apiErrorMessage(e)}`);
    return false;
  }
}
