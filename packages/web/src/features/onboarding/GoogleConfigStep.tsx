import { apiBase } from "../../config";
import { GateButton } from "./GateButton";
import { GateIntro } from "./GateIntro";
import { GoogleOAuthSteps } from "./GoogleOAuthSteps";
import { MissingEnvList } from "./MissingEnvList";
import { RedirectUriField } from "./RedirectUriField";
import { SetupPromptCard } from "./SetupPromptCard";
import { googleSetupPrompt, suggestedRedirectUri } from "./setupPrompt";

interface Props {
  titleId: string;
  descriptionId: string;
  /** The `GOOGLE_*` variable names the server reports as unset. */
  missing: readonly string[];
  /** A re-check of the server's configuration is in flight. */
  checking: boolean;
  onCheckAgain: () => void;
}

/**
 * The Google step (#120): the server has no Google OAuth client, so there is no
 * consent URL to send anyone to and the connect step after it would offer a
 * button that can only fail.
 *
 * Its work happens outside the app. The redesign draws a form that saves the
 * client id and secret; miel keeps them as environment variables read by the
 * API process, so there is nothing to paste here: naming what is missing,
 * saying where the values come from and where to put them is the whole of what
 * the browser can do. The step clears when the API is restarted with them set,
 * which "Check again" (or the gate's next refetch) notices.
 *
 * Which is why the walkthrough is here in full (#138) — as the design's setup
 * prompt for an assistant, and as the ordered list {@link GoogleOAuthSteps}
 * the README and the public guide read from core.
 */
export const GoogleConfigStep = ({
  titleId,
  descriptionId,
  missing,
  checking,
  onCheckAgain,
}: Props) => {
  const redirectUri = suggestedRedirectUri(apiBase, window.location.origin);
  return (
    <>
      <GateIntro
        titleId={titleId}
        descriptionId={descriptionId}
        title="Create a Google OAuth client"
      >
        miel signs into Gmail with your own Google client, and this server has not been given one
        yet. Create it, put its values in the <code className="font-mono">.env</code> file at the
        root of the deployment, then restart the API.
      </GateIntro>
      <SetupPromptCard prompt={googleSetupPrompt(redirectUri)} />
      <RedirectUriField uri={redirectUri} />
      <div className="mt-5 w-full text-left">
        <div className="mb-2 text-[13px] font-semibold text-gousse-ink">Missing on the server</div>
        <MissingEnvList names={missing} />
      </div>
      <details className="group mt-5 w-full text-left">
        <summary className="cursor-pointer text-[13px] font-semibold text-gousse-ink marker:text-gousse-muted">
          Where those values come from
        </summary>
        <div className="mt-3">
          <GoogleOAuthSteps />
        </div>
      </details>
      <GateButton
        className="mt-6 w-full"
        onClick={onCheckAgain}
        pending={checking}
        pendingLabel="Checking…"
      >
        I've restarted the API — check again
      </GateButton>
    </>
  );
};
