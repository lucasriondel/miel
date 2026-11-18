import { describe, expect, test } from "bun:test";
import { GOOGLE_OAUTH_CALLBACK_PATH, GOOGLE_OAUTH_SETUP_STEPS } from "@miel/core/googleOAuthSetup";
import { googleSetupPrompt, suggestedRedirectUri } from "./setupPrompt";

describe("suggestedRedirectUri", () => {
  test("is the callback path under a path-only API base, on this origin", () => {
    expect(suggestedRedirectUri("/api", "https://miel.example.com")).toBe(
      `https://miel.example.com/api${GOOGLE_OAUTH_CALLBACK_PATH}`,
    );
  });

  test("keeps an absolute API base's own origin", () => {
    expect(suggestedRedirectUri("https://api.example.com", "https://miel.example.com")).toBe(
      `https://api.example.com${GOOGLE_OAUTH_CALLBACK_PATH}`,
    );
  });
});

describe("googleSetupPrompt", () => {
  test("lists core's steps in order, numbered, and names the redirect URI", () => {
    const prompt = googleSetupPrompt("https://x.test/api/auth/google/callback");
    let last = -1;
    for (const [i, step] of GOOGLE_OAUTH_SETUP_STEPS.entries()) {
      const at = prompt.indexOf(`${i + 1}. ${step.title}`);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
    expect(prompt).toContain("https://x.test/api/auth/google/callback");
  });
});
