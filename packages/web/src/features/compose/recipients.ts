/**
 * The address lists in the compose window's To and Cc fields (#96).
 *
 * Each is one text field, the way every mail client writes them, so the array
 * the API is sent is a parse of what was typed. The field is never rewritten
 * under the caret — reformatting someone's half-typed address as they go is the
 * one thing a recipient field must not do — which is why parsing and validating
 * are separate, and why validation leaves the entry being typed alone.
 */

/** Comma, semicolon or newline: whatever a user types or pastes in. */
const SEPARATORS = /[,;\n]/;

export const parseAddressList = (value: string): string[] =>
  value
    .split(SEPARATORS)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export const formatAddressList = (addresses: readonly string[]): string => addresses.join(", ");

/**
 * Loose on purpose: this decides whether to warn, not whether Gmail will
 * accept, and a client that refuses an address its server would have delivered
 * is worse than one that lets the server answer. `local@domain`, bare or inside
 * the angle-bracket form with a display name in front of it.
 */
const looksLikeAddress = (entry: string): boolean => {
  const angled = /<([^<>]+)>\s*$/.exec(entry);
  const address = angled ? angled[1]!.trim() : entry;
  return /^[^\s@]+@[^\s@]+$/.test(address);
};

/**
 * The entries that are finished and are not addresses. The last one is finished
 * only once a separator follows it: every address passes through "al" on its
 * way to "alice@example.com", and flagging that would paint the window red for
 * the whole time the user is working in it.
 */
export const invalidAddresses = (value: string): string[] => {
  const entries = parseAddressList(value);
  const finished = SEPARATORS.test(value.trimEnd().slice(-1)) ? entries : entries.slice(0, -1);
  return finished.filter((entry) => !looksLikeAddress(entry));
};
