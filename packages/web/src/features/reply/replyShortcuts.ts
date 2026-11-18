import type { ReplyMode } from "../compose/composeSession";

/** What a reader key asks for: one of the three ways to answer, or a reply drafted with the AI. */
export type ReplyShortcut = ReplyMode | "draftWithAi";

interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  target: EventTarget | null;
}

/** Typing into a field is never a shortcut. */
const isTyping = (target: EventTarget | null): boolean => {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const el = target as HTMLElement;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
};

/**
 * The reader's single-letter keys (the redesign's "8 · Keyboard"): R reply,
 * A reply all, F forward, ⇧R draft a reply with the AI. Bare letters only — a
 * modified key belongs to the browser — and never while focus is in a field.
 * A reply-all with nobody to add is not offered, so its key does nothing.
 */
export const replyShortcut = (e: KeyLike, canReplyAll: boolean): ReplyShortcut | null => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTyping(e.target)) return null;
  const key = e.key.toLowerCase();
  if (key === "r") return e.shiftKey ? "draftWithAi" : "reply";
  if (e.shiftKey) return null;
  if (key === "a") return canReplyAll ? "replyAll" : null;
  if (key === "f") return "forward";
  return null;
};

/** "Reply all · 3 people": everyone a reply-all reaches — the sender and the other participants. */
export const replyAllLabel = (otherParticipants: number): string =>
  `Reply all · ${otherParticipants + 1} people`;
