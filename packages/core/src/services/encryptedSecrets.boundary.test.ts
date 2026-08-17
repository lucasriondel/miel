// The service boundary of #104, #107 and #109, asserted from outside: whatever
// else `@miel/core` hands out, it does not hand out a decrypted secret — not a
// vendor API key, not worp's key, and not the Claude Code token.
//
// One file for all of them because it is one rule, and because it imports the
// real barrel: that used to mean it could not live in a suite faking
// `../db/client` process-wide, which encryptedSecrets.test.ts and
// claudeCodeToken.test.ts both did. Neither fakes anything now (#132) — they
// inject a store — so the separation is no longer forced, only tidy.
import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

const core = await import("../index");

describe("@miel/core barrel", () => {
  test("exports the credential status API", () => {
    expect(typeof core.getProviderCredentialStatus).toBe("function");
    expect(typeof core.setProviderCredential).toBe("function");
    expect(typeof core.deleteProviderCredential).toBe("function");
    // One entry per hosted vendor a task can be pointed at (#105).
    expect(core.CREDENTIAL_PROVIDERS).toEqual(["anthropic", "google", "openai"]);
  });

  test("exports the Claude Code token status API", () => {
    expect(typeof core.getClaudeCodeTokenStatus).toBe("function");
    expect(typeof core.setClaudeCodeToken).toBe("function");
    expect(typeof core.deleteClaudeCodeToken).toBe("function");
    expect(core.CLAUDE_CODE_TOKEN_SECRET).toBe("claude_code.oauth_token");
  });

  test("exports nothing that reads a decrypted secret", () => {
    const leaking = Object.keys(core).filter(
      (k) =>
        k.startsWith("readProviderCredential") ||
        k.startsWith("readClaudeCodeToken") ||
        k.startsWith("readSecret") ||
        k.startsWith("readWorp"),
    );
    expect(leaking).toEqual([]);
  });
});
