// The request schemas for the secrets the app lets you paste: a vendor API key,
// the Claude Code token, and worp's key — which is a field inside a patch rather
// than a request of its own.
//
// What is asserted here is that all three share one minimum, MIN_KEY_LENGTH, so
// a value too short to be a credential is a 400 at the edge on every route
// rather than a stored value that only fails when something tries to use it
// (#118). worp's field carries the one exception, and it is asserted too: an
// empty string means "clear the key", so the minimum applies above it and not
// from the first character.
//
// Schemas only — no db, no environment, so this needs no Postgres.
import { describe, expect, test } from "bun:test";
import { MIN_KEY_LENGTH } from "../credentialMasking";
import {
  SetClaudeCodeTokenRequest,
  SetProviderCredentialRequest,
  UpdateWorpSettingsRequest,
} from "./api";

const TOO_SHORT = "sk-".padEnd(MIN_KEY_LENGTH - 1, "x");
const LONG_ENOUGH = "sk-".padEnd(MIN_KEY_LENGTH, "x");

/** The parsed value of `apiKey`, or the marker that the patch was refused. */
const parseWorpKey = (apiKey: unknown): string | null | undefined | "refused" => {
  const result = UpdateWorpSettingsRequest.safeParse({ apiKey });
  return result.success ? result.data.apiKey : "refused";
};

describe("the minimum every pasted secret shares", () => {
  test("a provider key below it is refused", () => {
    expect(SetProviderCredentialRequest.safeParse({ apiKey: TOO_SHORT }).success).toBe(false);
    expect(SetProviderCredentialRequest.safeParse({ apiKey: LONG_ENOUGH }).success).toBe(true);
  });

  test("a Claude Code token below it is refused", () => {
    expect(SetClaudeCodeTokenRequest.safeParse({ token: TOO_SHORT }).success).toBe(false);
    expect(SetClaudeCodeTokenRequest.safeParse({ token: LONG_ENOUGH }).success).toBe(true);
  });

  // The bug: worp's key was the one field with no minimum, so a one-character
  // key saved cleanly and worp then reported itself configured.
  test("a worp key below it is refused", () => {
    expect(parseWorpKey(TOO_SHORT)).toBe("refused");
    expect(parseWorpKey(LONG_ENOUGH)).toBe(LONG_ENOUGH);
  });

  test("a one-character worp key is refused", () => {
    expect(parseWorpKey("x")).toBe("refused");
  });

  // Trimmed before it is measured, on all three: a pasted key routinely carries
  // a trailing newline, and padding must not buy a short key its length.
  test("measures the trimmed value, not the padding around it", () => {
    expect(parseWorpKey(`  ${TOO_SHORT}\n`)).toBe("refused");
    expect(parseWorpKey(`  ${LONG_ENOUGH}\n`)).toBe(LONG_ENOUGH);
    expect(SetProviderCredentialRequest.safeParse({ apiKey: ` ${TOO_SHORT} ` }).success).toBe(
      false,
    );
    expect(SetClaudeCodeTokenRequest.safeParse({ token: ` ${TOO_SHORT} ` }).success).toBe(false);
  });
});

describe("worp's apiKey — clearing is not a short key", () => {
  test("an empty string survives: it is how the key is cleared", () => {
    expect(parseWorpKey("")).toBe("");
  });

  test("a blank string clears too, trimmed to empty rather than refused", () => {
    expect(parseWorpKey("   ")).toBe("");
  });

  test("null clears the stored key", () => {
    expect(parseWorpKey(null)).toBeNull();
  });

  test("an omitted key leaves the stored one alone", () => {
    const parsed = UpdateWorpSettingsRequest.safeParse({ baseUrl: "https://worp.example.com" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.apiKey).toBeUndefined();
  });

  // The rest of the patch is unaffected by the new check.
  test("a patch with a long-enough key and a header still parses whole", () => {
    const parsed = UpdateWorpSettingsRequest.safeParse({
      baseUrl: "https://worp.example.com",
      apiKey: LONG_ENOUGH,
      extraHeaders: { "X-Proxy": "abc", "X-Gone": null },
    });
    expect(parsed.success).toBe(true);
  });
});
