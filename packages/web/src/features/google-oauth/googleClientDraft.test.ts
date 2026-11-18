import { describe, expect, test } from "bun:test";
import { googleOAuthStatus, NO_GOOGLE_CLIENT } from "../../api/googleOAuthStatus.fixture";
import {
  defaultRedirectUri,
  draftIsSavable,
  fieldRefusal,
  mailboxesDisconnected,
  toSaveInput,
} from "./googleClientDraft";

const STORED = googleOAuthStatus({ source: "database", secretHint: "GOCSPX…a1b" });
const draft = (over: Partial<{ clientId: string; clientSecret: string; redirectUri: string }>) => ({
  clientId: STORED.clientId!,
  clientSecret: "",
  redirectUri: STORED.redirectUri!,
  ...over,
});

describe("the redirect URI the form starts from", () => {
  test("the one in effect", () => {
    expect(defaultRedirectUri(STORED, "/api", "https://other.example.com")).toBe(
      STORED.redirectUri!,
    );
  });

  test("else the API callback on this app's address", () => {
    expect(defaultRedirectUri(NO_GOOGLE_CLIENT, "/api", "https://mail.example.com")).toBe(
      "https://mail.example.com/api/auth/google/callback",
    );
  });

  test("else, behind a .localhost name Google refuses, the dev API's own", () => {
    expect(defaultRedirectUri(NO_GOOGLE_CLIENT, "/api", "https://miel.localhost")).toBe(
      NO_GOOGLE_CLIENT.devRedirectUri,
    );
  });
});

describe("what may be saved", () => {
  test("a stored secret is kept for the same client only", () => {
    expect(draftIsSavable(STORED, draft({}))).toBe(true);
    expect(draftIsSavable(STORED, draft({ clientId: "other" }))).toBe(false);
    expect(draftIsSavable(googleOAuthStatus(), draft({}))).toBe(false);
  });

  test("an empty secret box is left out of the request", () => {
    expect(toSaveInput(draft({ clientId: " id " }))).toEqual({
      clientId: "id",
      redirectUri: STORED.redirectUri!,
    });
  });
});

describe("the disconnect warning", () => {
  const withAccounts = { ...STORED, accountsToReconnect: 3 };

  test("counts the mailboxes a different client strands", () => {
    expect(mailboxesDisconnected(withAccounts, draft({ clientId: "other" }))).toBe(3);
  });

  test("says nothing for the same client, or on a fresh install", () => {
    expect(mailboxesDisconnected(withAccounts, draft({}))).toBe(0);
    expect(
      mailboxesDisconnected(
        { ...NO_GOOGLE_CLIENT, accountsToReconnect: 3 },
        draft({ clientId: "x" }),
      ),
    ).toBe(0);
  });
});

describe("a refused save", () => {
  test("names its field with the server's sentence", () => {
    const err = Object.assign(new Error("invalid_google_oauth_config"), {
      body: { error: "invalid_google_oauth_config", field: "clientId", message: "Not an ID." },
    });
    expect(fieldRefusal(err)).toEqual({ field: "clientId", message: "Not an ID." });
  });

  test("any other failure belongs to no field", () => {
    expect(fieldRefusal(Object.assign(new Error("x"), { body: { error: "internal" } }))).toBeNull();
    expect(fieldRefusal(new TypeError("Failed to fetch"))).toBeNull();
  });
});
