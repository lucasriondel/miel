import { startGoogleOAuth } from "../../api/googleOAuth";
import { GateButton } from "./GateButton";
import { GoogleMark } from "./GoogleMark";

interface Props {
  /** The browser is on its way to Google — the button waits rather than repeats. */
  waiting: boolean;
  onWaitingChange: (waiting: boolean) => void;
  /** Fired before the browser leaves, so the last attempt's failure goes with it. */
  onStart?: () => void;
}

/**
 * The gate's connect action: the same in-app OAuth start as Settings' button
 * (`startGoogleOAuth`, coming back to the inbox of the account it connects), in
 * the redesign's shape — Google's mark on the ink button, and "Waiting for
 * Google…" on the quiet fill once the browser is on its way.
 *
 * The waiting flag is the step's, not the button's, because the step's own copy
 * changes with it. A start the server refuses toasts (inside `startGoogleOAuth`)
 * and puts the button back.
 */
export const ConnectWithGoogleButton = ({ waiting, onWaitingChange, onStart }: Props) => {
  const connect = async () => {
    if (waiting) return;
    onWaitingChange(true);
    onStart?.();
    const ok = await startGoogleOAuth("inbox");
    if (!ok) onWaitingChange(false);
  };
  return (
    <GateButton
      className="mt-6"
      onClick={connect}
      pending={waiting}
      pendingLabel="Waiting for Google…"
      mark={<GoogleMark />}
    >
      Connect with Google
    </GateButton>
  );
};
