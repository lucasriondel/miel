/**
 * How a stored provider credential is shown back to whoever stored it, as
 * numbers and one function rather than prose.
 *
 * A leaf module for the same reason as `claudeUsage.ts`: the public privacy
 * policy describes this masking and imports these constants
 * (`@miel/core/credentialMasking`) instead of restating them, so the promise the
 * page makes to a reader cannot drift from what the code does (#113). Nothing
 * here touches the db or the environment, which is what lets the landing page
 * depend on it.
 *
 * `services/encryptedSecrets.ts` — the only module that ever holds a decrypted
 * secret — imports the same values, so there is one definition of what may
 * travel outward.
 */

/**
 * A key shorter than this is a paste accident, not a credential, and a save is
 * refused. Note that it is *below* {@link HINT_MIN_LENGTH}: a key in between the
 * two is accepted and then shown with no hint, which is a thing the privacy page
 * has to say out loud rather than gloss over.
 */
export const MIN_KEY_LENGTH = 8;

/** Characters of the key kept at the front of a hint. */
export const HINT_PREFIX = 7;

/** Characters of the key kept at the end of a hint. */
export const HINT_SUFFIX = 3;

/**
 * The shortest secret that gets a hint at all. Below it the
 * `HINT_PREFIX + HINT_SUFFIX` revealed characters would be most of the secret,
 * so {@link maskCredential} reveals none of them.
 */
export const HINT_MIN_LENGTH = HINT_PREFIX + HINT_SUFFIX + 4;

/**
 * The only representation of a key that may travel outward: the vendor prefix
 * plus the last three characters — enough to tell two keys apart when rotating,
 * useless to anyone who intercepts it. Short secrets get no hint at all rather
 * than a hint that is most of the secret.
 */
export function maskCredential(secret: string): string {
  const s = secret.trim();
  if (s.length < HINT_MIN_LENGTH) return "…";
  return `${s.slice(0, HINT_PREFIX)}…${s.slice(-HINT_SUFFIX)}`;
}
