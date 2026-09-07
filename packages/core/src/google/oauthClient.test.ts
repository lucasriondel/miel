import { describe, test, expect } from "bun:test";
import {
  GOOGLE_SCOPES,
  googleOAuthConfigStatus,
  missingOAuthEnv,
  makeOAuthClient,
} from "./oauthClient";

const FULL = {
  clientId: "cid",
  clientSecret: "sec",
  redirectUri: "http://localhost:3001/auth/google/callback",
};

describe("GOOGLE_SCOPES", () => {
  test("covers every Gmail operation miel performs", () => {
    expect(GOOGLE_SCOPES).toContain("https://www.googleapis.com/auth/gmail.modify");
    expect(GOOGLE_SCOPES).toContain("https://www.googleapis.com/auth/gmail.send");
    expect(GOOGLE_SCOPES).toContain("https://www.googleapis.com/auth/gmail.settings.basic");
    expect(GOOGLE_SCOPES).toContain("https://www.googleapis.com/auth/userinfo.email");
  });

  test("does not request the over-broad full-mail scope", () => {
    expect(GOOGLE_SCOPES).not.toContain("https://mail.google.com/");
  });
});

describe("missingOAuthEnv", () => {
  test("empty when all three are present", () => {
    expect(missingOAuthEnv(FULL)).toEqual([]);
  });

  test("lists exactly the absent vars", () => {
    expect(missingOAuthEnv({ ...FULL, clientId: "" })).toEqual(["GOOGLE_CLIENT_ID"]);
    expect(missingOAuthEnv({ clientId: "", clientSecret: "", redirectUri: "" })).toEqual([
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_REDIRECT_URI",
    ]);
  });
});

describe("googleOAuthConfigStatus", () => {
  test("configured exactly when nothing is missing", () => {
    expect(googleOAuthConfigStatus(FULL)).toEqual({ configured: true, missing: [] });
  });

  test("not configured, and says which, when one is absent", () => {
    expect(googleOAuthConfigStatus({ ...FULL, clientSecret: "" })).toEqual({
      configured: false,
      missing: ["GOOGLE_CLIENT_SECRET"],
    });
  });

  test("carries no values — one of the three is a secret", () => {
    const status = googleOAuthConfigStatus(FULL);

    expect(JSON.stringify(status)).not.toContain("sec");
  });
});

describe("makeOAuthClient", () => {
  test("generates a consent URL with offline access + forced consent + scopes", () => {
    const oauth = makeOAuthClient(FULL);
    const url = oauth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [...GOOGLE_SCOPES],
      state: "s1",
    });
    expect(url.startsWith("https://accounts.google.com/")).toBe(true);
    expect(url).toContain("access_type=offline");
    expect(url).toContain("prompt=consent");
    expect(url).toContain("gmail.modify");
    expect(url).toContain("state=s1");
  });
});
