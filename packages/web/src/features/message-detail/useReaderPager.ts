import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ListedMessage } from "../../api/types";
import { messageDetailPath } from "../inbox/inboxLocation";
import { isTypingTarget } from "../shell/isTypingTarget";

/**
 * Walking the list from the reader: the open message's place in the list's
 * reading order, and the neighbour on either side. Moving *replaces* the
 * history entry, so Back still leaves the reader for the list rather than
 * stepping through every message read on the way. `J` and `K` do the same
 * from the keyboard.
 */
export function useReaderPager(
  order: readonly ListedMessage[],
  gmailMessageId: string | undefined,
) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const index = order.findIndex((m) => m.gmailMessageId === gmailMessageId);

  const go = useCallback(
    (m: ListedMessage | undefined) => {
      if (!m) return;
      navigate(messageDetailPath(m.accountId, m.gmailMessageId, search), { replace: true });
    },
    [navigate, search],
  );

  const prev = index > 0 ? order[index - 1] : undefined;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : undefined;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === "j") go(next);
      else if (e.key === "k") go(prev);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go, next, prev]);

  return {
    position: index + 1,
    total: order.length,
    onPrev: prev ? () => go(prev) : undefined,
    onNext: next ? () => go(next) : undefined,
  };
}
