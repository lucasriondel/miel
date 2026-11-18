import type { GoogleOAuthConfigStatus } from "./types";

/**
 * A `GoogleOAuthConfigStatus` for tests: a server with a client from its
 * environment unless the overrides say otherwise.
 */
export const googleOAuthStatus = (
  overrides: Partial<GoogleOAuthConfigStatus> = {},
): GoogleOAuthConfigStatus => ({
  configured: true,
  missing: [],
  source: "environment",
  clientId: "1234-abc.apps.googleusercontent.com",
  redirectUri: "https://mail.example.com/api/auth/google/callback",
  secretHint: null,
  devRedirectUri: "http://localhost:5531/auth/google/callback",
  callbackPath: "/auth/google/callback",
  accountsToReconnect: 0,
  ...overrides,
});

/** A fresh install: no client anywhere. */
export const NO_GOOGLE_CLIENT: GoogleOAuthConfigStatus = googleOAuthStatus({
  configured: false,
  missing: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  source: null,
  clientId: null,
  redirectUri: null,
});
