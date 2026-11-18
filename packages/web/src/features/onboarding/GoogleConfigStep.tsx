import type { GoogleOAuthConfigStatus } from "../../api/types";
import { apiBase } from "../../config";
import { GoogleClientForm } from "../google-oauth/GoogleClientForm";
import { defaultRedirectUri } from "../google-oauth/googleClientDraft";
import { EnvAlternativeFootnote } from "./EnvAlternativeFootnote";
import { GateIntro } from "./GateIntro";
import { GoogleOAuthSteps } from "./GoogleOAuthSteps";
import { SetupPromptCard } from "./SetupPromptCard";
import { googleSetupPrompt } from "./setupPrompt";

interface Props {
  titleId: string;
  descriptionId: string;
  /** What the server reports: no client yet, or the one it had. */
  status: GoogleOAuthConfigStatus;
  /** A re-check of the server's configuration is in flight. */
  checking: boolean;
  onCheckAgain: () => void;
}

/**
 * The Google step (#120, A15): the server has no Google OAuth client, so there
 * is no consent URL to send anyone to and the connect step after it would offer
 * a button that can only fail.
 *
 * The client is pasted here and saved in miel; the save writes the status into
 * the gate's cache, which is what moves the gate on, and the client takes
 * effect on the next sign-in with nothing restarted. The server's `.env` is
 * still read as the fallback, which the footnote names for an operator who
 * would rather keep it there.
 *
 * The walkthrough is here in full (#138) — as the design's setup prompt for an
 * assistant, and as the ordered list {@link GoogleOAuthSteps} the README and
 * the public guide read from core.
 */
export const GoogleConfigStep = ({
  titleId,
  descriptionId,
  status,
  checking,
  onCheckAgain,
}: Props) => {
  const redirectUri = defaultRedirectUri(status, apiBase, window.location.origin);
  return (
    <>
      <GateIntro
        titleId={titleId}
        descriptionId={descriptionId}
        title="Create a Google OAuth client"
      >
        miel signs into Gmail with your own Google client. Have an assistant walk you through
        creating one, then paste its values below.
      </GateIntro>
      <SetupPromptCard prompt={googleSetupPrompt(redirectUri)} />
      <div className="mt-5 w-full">
        <GoogleClientForm status={status} variant="gate" />
      </div>
      <details className="group mt-5 w-full text-left">
        <summary className="cursor-pointer text-[13px] font-semibold text-gousse-ink marker:text-gousse-muted">
          Where those values come from
        </summary>
        <div className="mt-3">
          <GoogleOAuthSteps />
        </div>
      </details>
      <EnvAlternativeFootnote checking={checking} onCheckAgain={onCheckAgain} />
    </>
  );
};
