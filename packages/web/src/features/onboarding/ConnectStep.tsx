import { ConnectGoogleButton } from "../settings/ConnectGoogleButton";
import { ConnectFailureNotice } from "./ConnectFailureNotice";

interface Props {
  titleId: string;
  descriptionId: string;
  errorId: string;
  /**
   * Why the last connect attempt failed, in plain English (see
   * `useConnectResult`). A failed connect leaves the user with zero accounts,
   * so the gate reopens over the toast that reported it — behind a blocking
   * dialog, the dialog has to carry the message itself.
   */
  error?: string | null;
  /** Called when the user retries, so the stale failure goes with the attempt. */
  onRetry?: () => void;
}

/**
 * Step one of the gate: with no Gmail account connected there is nothing to
 * triage on any route, so this is the first thing asked for.
 */
export const ConnectStep = ({ titleId, descriptionId, errorId, error, onRetry }: Props) => (
  <>
    <h1 id={titleId} className="mt-5 text-lg font-bold tracking-tight text-gousse-ink">
      Connect a Gmail account
    </h1>
    <p id={descriptionId} className="mt-2 text-sm font-medium leading-relaxed text-gousse-muted">
      miel reads your mail, triages it with AI and suggests labels — all of which needs a mailbox to
      work on. Connect a Google account to get started.
    </p>
    {error ? <ConnectFailureNotice id={errorId} message={error} /> : null}
    <div className="mt-6">
      {/* Back to the inbox of the account just connected, not settings: the
          gate's only promise is the app behind it. */}
      <ConnectGoogleButton returnTo="inbox" onStart={onRetry} />
    </div>
  </>
);
