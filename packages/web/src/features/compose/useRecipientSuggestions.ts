import { useEffect, useMemo, useState } from "react";
import { useContactSuggestions, type ContactSuggestion } from "../../api/composeReads.hooks";

interface Options {
  accountId: string;
  /** What is typed and not yet a chip. */
  text: string;
  /** Addresses already on the row: suggesting one again would add it twice. */
  exclude: readonly string[];
  /** The list only shows under a field that has the caret. */
  focused: boolean;
}

/** How long typing has to pause before the field asks who it might be. */
const PAUSE_MS = 150;

/**
 * The state of an address field's suggestions: which people match what is
 * typed, whether the list is showing, and which one is highlighted. Escape
 * hides the list until the next keystroke; the highlight starts on the first
 * match every time the matches change.
 */
export function useRecipientSuggestions({ accountId, text, exclude, focused }: Options) {
  const [query, setQuery] = useState(text);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
    const timer = setTimeout(() => setQuery(text), PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const typed = text.trim().length > 0;
  const answer = useContactSuggestions(accountId, typed ? query : "");
  const items = answer.data?.items;

  const suggestions = useMemo<ContactSuggestion[]>(() => {
    const taken = new Set(exclude.map((e) => e.toLowerCase()));
    return (items ?? []).filter((c) => !taken.has(c.email.toLowerCase()));
  }, [items, exclude]);

  useEffect(() => setActive(0), [suggestions]);

  const open = focused && typed && !dismissed && suggestions.length > 0;
  const move = (delta: number) =>
    setActive((i) =>
      suggestions.length === 0 ? 0 : (i + delta + suggestions.length) % suggestions.length,
    );

  return {
    suggestions,
    open,
    active: Math.min(active, Math.max(suggestions.length - 1, 0)),
    setActive,
    move,
    dismiss: () => setDismissed(true),
  };
}
