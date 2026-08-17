import { useState } from "react";
import type { ConnectReturnTarget } from "@miel/core/connectReturn";
import { startGoogleOAuth } from "../../api/googleOAuth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface ConnectGoogleButtonProps {
  /**
   * Where the browser should come back to once Google is done. Defaults to
   * settings — the host this button was built for; the onboarding gate passes
   * "inbox" so a first-time connect lands in the app it just unlocked.
   */
  returnTo?: ConnectReturnTarget;
  /**
   * Fired when a connect attempt starts, before the browser leaves for Google.
   * The onboarding gate uses it to drop the previous attempt's failure message.
   */
  onStart?: () => void;
}

/**
 * "Connect with Google" action — starts the in-app OAuth flow (see
 * `startGoogleOAuth`) and navigates the browser to Google's consent screen.
 * Bare button — the surrounding copy lives in whatever row hosts it.
 */
export const ConnectGoogleButton = ({ returnTo, onStart }: ConnectGoogleButtonProps) => {
  const [starting, setStarting] = useState(false);

  const connect = async () => {
    if (starting) return;
    setStarting(true);
    onStart?.();
    const ok = await startGoogleOAuth(returnTo);
    if (!ok) setStarting(false);
  };

  return (
    <Button variant="primary" onClick={connect} disabled={starting}>
      {starting ? <Spinner size={12} /> : null}
      {starting ? "Redirecting…" : "Connect with Google"}
    </Button>
  );
};
