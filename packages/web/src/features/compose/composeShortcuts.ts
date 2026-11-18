/**
 * The compose window's keys (the redesign's "8 · Keyboard"), as a pure match
 * from a key event to what it asks for, so the table is assertable without a
 * render. ⌘ on a Mac, Ctrl elsewhere.
 *
 * Scoped to the window: the handler sits on the window's own element, so these
 * fire only while focus is inside it and never reach the page underneath.
 */
export type ComposeShortcut = "send" | "sendArchive" | "ai" | "escape" | "discard";

interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export const composeShortcut = (e: KeyLike): ComposeShortcut | null => {
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === "Escape") return "escape";
  if (!mod) return null;
  if (e.key === "Enter") return e.shiftKey ? "sendArchive" : "send";
  if (e.key.toLowerCase() === "j") return "ai";
  if (e.key === "Backspace") return "discard";
  return null;
};

/** The link a sent message's confirmation offers: the thread, in the mailbox it went from. */
export const gmailThreadUrl = (accountEmail: string, threadId: string): string =>
  `https://mail.google.com/mail/u/${encodeURIComponent(accountEmail)}/#all/${encodeURIComponent(threadId)}`;

/** "10:42" — the time a draft was saved or a message went. */
export const clockTime = (at: Date): string =>
  at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
