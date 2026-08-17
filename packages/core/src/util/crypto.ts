/**
 * Encryption of secrets at rest.
 *
 * Two kinds of secret go through here, and both are long-lived bearer
 * credentials we refuse to keep in plaintext in Postgres: a Google refresh
 * token (`accounts.refresh_token`, access to the user's whole mailbox) and an
 * LLM provider API key (`encrypted_secrets.encrypted_value`, a billable
 * account). We use AES-256-GCM (authenticated encryption) with a key from
 * `TOKEN_ENCRYPTION_KEY` (a 32-byte base64 string), and store the blob as
 * `iv:tag:ciphertext`, each part base64.
 *
 * Dev convenience: if `TOKEN_ENCRYPTION_KEY` is absent we fall back to storing
 * the secret verbatim (prefixed `plain:`) and warn once — so local dev boots
 * without ceremony. In production the env validation requires the key, so this
 * fallback never fires there.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createDebug } from "./debug";

const debug = createDebug("crypto");

const PLAIN_PREFIX = "plain:";
let warnedNoKey = false;

/**
 * Decode the configured key; null when unset (dev fallback path).
 *
 * Read straight from `process.env` (not the cached `getEnv()`) so the key is
 * picked up even if the env singleton was populated before it was set — and so
 * tests can toggle it per-case. It's a raw secret, not behaviour config.
 */
function key(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(`TOKEN_ENCRYPTION_KEY must decode to 32 bytes, got ${buf.length}`);
  }
  return buf;
}

function warnOnce(): void {
  if (warnedNoKey) return;
  warnedNoKey = true;
  console.warn("[crypto] TOKEN_ENCRYPTION_KEY unset — storing secrets in plaintext (dev only).");
}

/** Encrypt a secret into a storable blob. Never logs the plaintext. */
export function encrypt(plaintext: string): string {
  const k = key();
  if (!k) {
    warnOnce();
    return PLAIN_PREFIX + plaintext;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  debug("encrypt", { bytes: ciphertext.length });
  return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/** Decrypt a stored blob back into the secret. */
export function decrypt(blob: string): string {
  if (blob.startsWith(PLAIN_PREFIX)) {
    return blob.slice(PLAIN_PREFIX.length);
  }
  const k = key();
  if (!k) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY unset but the stored secret is encrypted — cannot decrypt.",
    );
  }
  const [ivB64, tagB64, dataB64] = blob.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted token blob (expected iv:tag:ciphertext).");
  }
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
