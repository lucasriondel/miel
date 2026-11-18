import { useState } from "react";
import { ConnectFailureNotice } from "./ConnectFailureNotice";
import { ConnectWithGoogleButton } from "./ConnectWithGoogleButton";
import { GateFootnote } from "./GateFootnote";
import { GateIntro } from "./GateIntro";

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
 * The mailbox step: with no Gmail account connected there is nothing to triage
 * on any route, so this is asked as soon as the server can do OAuth at all.
 *
 * Two faces, as the redesign draws them: the pitch with "Connect with Google",
 * and — once pressed — "Waiting for Google…" while the browser leaves for the
 * consent screen. The flow is same-tab, so the waiting face is short-lived; it
 * exists so a second press cannot start a second flow.
 */
export const ConnectStep = ({ titleId, descriptionId, errorId, error, onRetry }: Props) => {
  const [waiting, setWaiting] = useState(false);
  return (
    <>
      <GateIntro
        titleId={titleId}
        descriptionId={descriptionId}
        centered
        title="Connect a Gmail account"
      >
        {waiting
          ? "Taking you to Google to grant access. This window carries on by itself once you are back."
          : "miel needs a mailbox to triage. Connect a Google account to start."}
      </GateIntro>
      {error && !waiting ? <ConnectFailureNotice id={errorId} message={error} /> : null}
      <ConnectWithGoogleButton waiting={waiting} onWaitingChange={setWaiting} onStart={onRetry} />
      <GateFootnote>
        {waiting
          ? "Stuck here? Reload this page to start again."
          : "You'll be sent to Google to grant access, then straight back here."}
      </GateFootnote>
    </>
  );
};
