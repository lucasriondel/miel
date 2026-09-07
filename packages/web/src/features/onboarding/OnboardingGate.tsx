import { Modal } from "../../components/modal/Modal";
import { useAccounts, useSettings } from "../../api/queries";
import { useGoogleOAuthConfig } from "../../api/googleOAuthConfig.hooks";
import { assetUrl } from "../../lib/basePath";
import { AiSetupStep } from "./AiSetupStep";
import { ConnectStep } from "./ConnectStep";
import { GoogleConfigStep } from "./GoogleConfigStep";
import { StepProgress } from "./StepProgress";
import { onboardingStep } from "./onboardingStep";
import { useTriageCredential } from "./useTriageCredential";

const TITLE_ID = "onboarding-gate-title";
const DESCRIPTION_ID = "onboarding-gate-description";
const ERROR_ID = "onboarding-gate-error";

interface Props {
  /** The last connect failure, shown on step two. See {@link ConnectStep}. */
  error?: string | null;
  /** Called when the user retries, so the stale failure goes with the attempt. */
  onRetry?: () => void;
}

/**
 * First-run gate: three ordered steps, and the app stays blocked until all of
 * them are done (#111, #120). Give the server a Google OAuth client, because
 * without one there is no consent URL and the next step's button could only
 * fail; connect a Gmail account, because there is nothing to triage without
 * one; then give triage a provider and a credential, because a mailbox that
 * syncs and cannot be classified is the product's promise failing on the first
 * run with the reason buried in Settings.
 *
 * Deliberately non-dismissable on every step — no close control, no Escape, no
 * backdrop click, and `Modal` keeps focus inside — because there is no version
 * of the app behind it that works. A way past it would only move the failure
 * somewhere less explicable.
 *
 * Which step, and whether to open at all, is {@link onboardingStep}: settled
 * data only, so neither a slow request nor a failed background refetch can
 * flash the wall up or blink it away.
 */
export const OnboardingGate = ({ error, onRetry }: Props) => {
  // Environment, not a setting: the three GOOGLE_* variables the API reads.
  const googleConfig = useGoogleOAuthConfig();
  const accounts = useAccounts();
  // The credential that matters is the selected triage provider's, so the
  // settings are what say which one to ask about.
  const settings = useSettings();
  const credential = useTriageCredential(settings.data?.triageProvider);
  const step = onboardingStep(googleConfig, accounts, credential);
  const onFormStep = step === "ai" || step === "google-config";

  return (
    <Modal
      open={step !== null}
      labelledBy={TITLE_ID}
      // Both, in reading order: the pitch, then why the last try didn't take.
      describedBy={error && step === "connect" ? `${DESCRIPTION_ID} ${ERROR_ID}` : DESCRIPTION_ID}
      className={`onboarding-gate flex flex-col ${
        // The AI step holds a settings row — two dropdowns and a paste field —
        // and the config step a list of variables with explanations; both need
        // the width and read as a form, not as a pitch.
        onFormStep ? "sm:max-w-xl" : "items-center text-center"
      }`}
    >
      <div className="flex w-full flex-col items-center">
        <img
          src={assetUrl("/miel.webp")}
          alt=""
          className="h-14 w-14 rounded-2xl shadow-gousse-sm"
        />
        <div className="mt-4">
          <StepProgress current={step ?? "connect"} />
        </div>
      </div>
      {step === "google-config" && googleConfig.data ? (
        <GoogleConfigStep
          titleId={TITLE_ID}
          descriptionId={DESCRIPTION_ID}
          missing={googleConfig.data.missing}
        />
      ) : step === "ai" && settings.data ? (
        <AiSetupStep titleId={TITLE_ID} descriptionId={DESCRIPTION_ID} settings={settings.data} />
      ) : (
        <ConnectStep
          titleId={TITLE_ID}
          descriptionId={DESCRIPTION_ID}
          errorId={ERROR_ID}
          error={error}
          onRetry={onRetry}
        />
      )}
    </Modal>
  );
};
