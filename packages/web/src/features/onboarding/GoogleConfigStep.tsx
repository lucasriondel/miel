import { GoogleOAuthSteps } from "./GoogleOAuthSteps";
import { MissingEnvList } from "./MissingEnvList";

interface Props {
  titleId: string;
  descriptionId: string;
  /** The `GOOGLE_*` variable names the server reports as unset. */
  missing: readonly string[];
}

/**
 * Step one of the gate (#120): the server has no Google OAuth client, so there
 * is no consent URL to send anyone to and the connect step below would offer a
 * button that can only fail.
 *
 * The odd one out among the three steps — its work happens outside the app.
 * These three are environment variables read by the API process, not runtime
 * settings, so there is nothing to paste here and no action to offer: naming
 * what is missing, saying where the values come from and where to put them is
 * the whole of what the browser can do. It clears when the API is restarted
 * with them set, which the gate notices on its next refetch.
 *
 * Which is why the walkthrough below is here in full (#138) rather than a
 * breadcrumb pointing at the Google Cloud console. A reader who has got this
 * far has no consent screen, no client and nowhere else in the app to be sent:
 * this dialog is the whole instruction, and it renders the same steps
 * {@link GoogleOAuthSteps} the README and the public guide read from core.
 */
export const GoogleConfigStep = ({ titleId, descriptionId, missing }: Props) => (
  <>
    <h1 id={titleId} className="mt-5 text-lg font-bold tracking-tight text-gousse-ink">
      Finish the server setup
    </h1>
    <p id={descriptionId} className="mt-2 text-sm font-medium leading-relaxed text-gousse-muted">
      miel signs you into Gmail with its own Google OAuth client, and this server has not been given
      one yet. Add the missing values to the <code className="font-mono">.env</code> file at the
      root of the deployment, then restart the API.
    </p>
    <div className="mt-5 w-full">
      <MissingEnvList names={missing} />
    </div>
    <p className="mt-5 text-sm font-semibold text-gousse-ink">Where those values come from</p>
    <div className="mt-3 w-full">
      <GoogleOAuthSteps />
    </div>
  </>
);
