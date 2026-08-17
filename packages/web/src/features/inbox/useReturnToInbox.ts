import { useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { inboxReturnTarget } from "./inboxLocation";

/**
 * The subset of react-router's `NavigateFunction` this exit uses: a history
 * delta, or a URL that replaces the current entry. Naming it is what lets the
 * navigation below be tested without a DOM render.
 */
export interface InboxNavigate {
  (delta: number): void;
  (to: string, options: { replace: boolean }): void;
}

/**
 * Perform the exit: turn the target into the one navigation it stands for.
 *
 * Split from the hook so the choice of `-1` vs. a replacing push can be
 * asserted directly — the same seam `trashMessageMutationOptions` uses.
 */
export function navigateToInbox(
  navigate: InboxNavigate,
  input: { locationKey: string; accountId: string | undefined; search: string },
): void {
  const target = inboxReturnTarget(input);
  if (target.kind === "back") navigate(-1);
  // Replace, not push: the message is gone (or being left), and a Back that
  // returns to it would show a 404 or a trashed message.
  else navigate(target.to, { replace: true });
}

/**
 * The one way off a message and back to the inbox (#95, #94).
 *
 * Every exit uses it — the Back button, the top bar's archive and trash, and
 * the confirmation panel's delete — so a message the user leaves by archiving
 * or deleting it lands in the same place as one they simply back out of: the
 * inbox they opened it from, with its account, filters and scroll offset
 * intact.
 *
 * That means `navigate(-1)` wherever there is an entry to go back to, since
 * only the history entry itself holds the scroll offset. Rebuilding the URL is
 * the fallback for a deep link, and it can only restore what the URL carries.
 */
export function useReturnToInbox(): () => void {
  const navigate = useNavigate();
  const { key, search } = useLocation();
  const { accountId } = useParams<{ accountId?: string }>();

  return useCallback(() => {
    navigateToInbox(navigate, { locationKey: key, accountId, search });
  }, [navigate, key, search, accountId]);
}
