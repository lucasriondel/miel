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
export const looksLikeAddress = (entry: string): boolean => {
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

/**
 * The chip editor's commit step (the redesign's To/Cc/Bcc rows): a separator
 * typed or pasted turns every entry before it into a chip and leaves what
 * follows the last one in the field. Nothing is committed while no separator
 * has been typed — the half-typed address under the caret stays exactly as it
 * is — and Enter or blur commit through {@link commitAll}.
 */
export const splitTyped = (value: string): { committed: string[]; rest: string } => {
  const parts = value.split(SEPARATORS);
  if (parts.length === 1) return { committed: [], rest: value };
  const rest = parts.pop() ?? "";
  return { committed: parseAddressList(parts.join(",")), rest: rest.trimStart() };
};

/** Enter or blur: whatever is in the field becomes chips. */
export const commitAll = (value: string): string[] => parseAddressList(value);

/** The address inside an entry, bare or in its `Name <address>` form. */
export const addressOf = (entry: string): string => {
  const angled = /<([^<>]+)>\s*$/.exec(entry);
  return (angled ? angled[1]! : entry).trim();
};

/**
 * What a chip says: a display name when one is known — typed in the
 * `Name <address>` form, or looked up from the message being answered — and
 * the address otherwise.
 */
export const recipientLabel = (entry: string, names: Readonly<Record<string, string>>): string => {
  const angled = /^(.*?)<[^<>]+>\s*$/.exec(entry);
  const typed = angled?.[1]?.trim().replace(/^"|"$/g, "");
  if (typed) return typed;
  return names[addressOf(entry).toLowerCase()] ?? addressOf(entry);
};

/** Two letters for a chip's avatar: the name's initials, or the address's first two. */
export const recipientInitials = (label: string): string => {
  const words = label
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter((w) => w.length > 0);
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
};
