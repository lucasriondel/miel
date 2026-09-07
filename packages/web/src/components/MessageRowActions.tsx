import { useEffect } from "react";
import { MessageActions } from "./MessageActions";
import type { Priority } from "../api/types";

interface Props {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  isUnread: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  priority: Priority | null;
  /** Mobile only: whether the swipe has revealed the actions. */
  isMobile: boolean;
  revealed: boolean;
  onClose: () => void;
}

/**
 * Presentation wrapper around the shared `MessageActions` for a list row.
 *
 * Desktop (`!isMobile`): actions are always mounted and revealed on hover/focus
 * by `MessageActions`' own `row` container CSS.
 *
 * Mobile: the actions are removed from the DOM until a leftward swipe sets
 * `revealed` — so there are no phantom tap targets behind the transparent right
 * edge of the row. When revealed we slide them in and dismiss on outside tap or
 * scroll.
 */
export const MessageRowActions = ({ isMobile, revealed, onClose, ...actions }: Props) => {
  useEffect(() => {
    if (!isMobile || !revealed) return;
    const dismiss = () => onClose();
    // Any tap/scroll outside the freshly-revealed actions dismisses them.
    // Defer so the swipe's own touchend doesn't immediately close it.
    const id = window.setTimeout(() => {
      document.addEventListener("pointerdown", dismiss);
      window.addEventListener("scroll", dismiss, { passive: true });
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("scroll", dismiss);
    };
  }, [isMobile, revealed, onClose]);

  if (!isMobile) {
    return <MessageActions {...actions} variant="row" />;
  }

  if (!revealed) return null;

  return (
    <div
      className="absolute inset-y-0 right-0 flex animate-slide-in-right items-center gap-1 bg-gradient-to-l from-gousse-bg via-gousse-bg to-transparent pl-12 pr-3"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <MessageActions {...actions} variant="row" forceVisible />
    </div>
  );
};
