import type { ListedMessage } from "../../api/types";

/**
 * The inbox search (⌘K): a client-side filter over the period already loaded —
 * the design says so in its own copy ("Search only covers this week … sender,
 * subject and snippet are all searched"), and there is no search endpoint.
 *
 * Every word of the query has to appear somewhere in the sender's name or
 * address, the subject or the snippet, case- and accent-insensitively, so
 * "acme invoice" finds Acme's invoice whatever order the words are in.
 */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export const searchWords = (query: string): string[] =>
  fold(query)
    .split(/\s+/)
    .filter((w) => w.length > 0);

export const searchMessages = (messages: ListedMessage[], query: string): ListedMessage[] => {
  const words = searchWords(query);
  if (words.length === 0) return messages;
  return messages.filter((m) => {
    const haystack = fold(
      [m.fromName ?? "", m.fromEmail, m.subject ?? "", m.snippet ?? ""].join(" "),
    );
    return words.every((w) => haystack.includes(w));
  });
};
