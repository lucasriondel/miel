import { describe, test, expect, beforeEach, afterEach } from "bun:test";

// crypto reads TOKEN_ENCRYPTION_KEY from process.env at call time; set it per case.
const KEY_B64 = Buffer.from("0".repeat(32), "utf8").toString("base64");

describe("crypto", () => {
  let prevKey: string | undefined;

  beforeEach(() => {
    prevKey = process.env.TOKEN_ENCRYPTION_KEY;
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = prevKey;
  });

  test("encrypt → decrypt round-trips with a 32-byte key", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY_B64;
    // The key is read at call time, so a single import is fine as long as the
    // env var is in place before encrypt/decrypt run.
    const { encrypt, decrypt } = await import("./crypto");
    const secret = "1//refresh-token-abc123";
    const blob = encrypt(secret);
    expect(blob).not.toContain(secret); // never store plaintext when keyed
    expect(blob.split(":").length).toBe(3); // iv:tag:ciphertext
    expect(decrypt(blob)).toBe(secret);
  });

  test("round-trips a provider API key too — the module is secret-agnostic", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY_B64;
    const { encrypt, decrypt } = await import("./crypto");
    const apiKey = "sk-ant-api03-abcdefghijklmnop3f9";
    const blob = encrypt(apiKey);
    expect(blob).not.toContain(apiKey);
    expect(decrypt(blob)).toBe(apiKey);
  });

  test("a tampered ciphertext fails authentication", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY_B64;
    const { encrypt, decrypt } = await import("./crypto");
    const blob = encrypt("sensitive");
    const [iv, tag, data] = blob.split(":");
    // Flip a byte in the ciphertext.
    const tampered = `${iv}:${tag}:${Buffer.from(
      Buffer.from(data, "base64").map((b, i) => (i === 0 ? b ^ 0xff : b)),
    ).toString("base64")}`;
    expect(() => decrypt(tampered)).toThrow();
  });
});
