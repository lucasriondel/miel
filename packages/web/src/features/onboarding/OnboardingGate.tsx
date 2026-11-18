import { Modal } from "../../components/modal/Modal";
import { useAccounts, useSettings } from "../../api/queries";
import { useGoogleOAuthConfig } from "../../api/googleOAuthConfig.hooks";
import { AiSetupStep } from "./AiSetupStep";
import { ConnectStep } from "./ConnectStep";
import { GateHeader } from "./GateHeader";
import { GoogleConfigStep } from "./GoogleConfigStep";
import { ServerStep } from "./ServerStep";
import { onboardingStep, type ServerCheckGateState } from "./onboardingStep";
import { useServerCheck } from "./serverCheck";
import { useTriageCredential } from "./useTriageCredential";

const TITLE_ID = "onboarding-gate-title";
const DESCRIPTION_ID = "onboarding-gate-description";
const ERROR_ID = "onboarding-gate-error";

/** What the server check reads as while the gate's other request is answering. */
const ANSWERING: ServerCheckGateState = {
  isPending: false,
  isError: false,
  data: { status: "ok" },
};

interface Props {
  /** The last connect failure, shown on the mailbox step. See {@link ConnectStep}. */
  error?: string | null;
  /** Called when the user retries, so the stale failure goes with the attempt. */
  onRetry?: () => void;
}

/**
 * First-run gate: four ordered steps — Server · Google · Mailbox · AI triage —
 * and the app stays blocked until all of them are done (#111, #120). A server
 * this page can talk to, because nothing else can be asked of one it cannot;
 * a Google OAuth client on it, because without one there is no consent URL and
 * the next step's button could only fail; a connected Gmail account, because
 * there is nothing to triage without one; then a provider and a credential for
 * triage, because a mailbox that syncs and cannot be classified is the
 * product's promise failing on the first run with the reason buried in
 * Settings.
 *
 * Deliberately non-dismissable on every step — no close control, no Escape, no
 * backdrop click, and `Modal` keeps focus inside — because there is no version
 * of the app behind it that works. A way past it would only move the failure
 * somewhere less explicable.
 *
 * Which step, and whether to open at all, is {@link onboardingStep}: settled
 * data only, so neither a slow request nor a failed background refetch can
 * flash the wall up or blink it away. The server check is only asked when the
 * Google-config request — made on every load anyway — has failed, and it is
 * what says whether that failure was the server's address or its secret.
 */
export const OnboardingGate = ({ error, onRetry }: Props) => {
  // The Google client: saved in the app, or the server's GOOGLE_* fallback.
  const googleConfig = useGoogleOAuthConfig();
  const serverCheck = useServerCheck(googleConfig.isError);
  const server = googleConfig.isError ? serverCheck : ANSWERING;
  const accounts = useAccounts();
  // The credential that matters is the selected triage provider's, so the
  // settings are what say which one to ask about.
  const settings = useSettings();
  const credential = useTriageCredential(settings.data?.triageProvider);
  const step = onboardingStep(server, googleConfig, accounts, credential);

  const checkAgain = () => {
    void googleConfig.refetch();
    if (googleConfig.isError) void serverCheck.refetch();
  };
  const serverStatus = serverCheck.data?.status;

  return (
    <Modal
      open={step !== null}
      labelledBy={TITLE_ID}
      // Both, in reading order: the pitch, then why the last try didn't take.
      describedBy={error && step === "connect" ? `${DESCRIPTION_ID} ${ERROR_ID}` : DESCRIPTION_ID}
      className={`flex flex-col items-center ${
        // The AI step holds two cards of settings rows — a credential grid and
        // a task row — and needs the width; the rest are one question each.
        step === "ai" ? "sm:max-w-[576px]" : ""
      }`}
    >
      <GateHeader step={step ?? "connect"} />
      {step === "server" && serverStatus && serverStatus !== "ok" ? (
        <ServerStep
          titleId={TITLE_ID}
          descriptionId={DESCRIPTION_ID}
          status={serverStatus}
          checking={serverCheck.isFetching || googleConfig.isFetching}
          onCheckAgain={checkAgain}
        />
      ) : step === "google-config" && googleConfig.data ? (
        <GoogleConfigStep
          titleId={TITLE_ID}
          descriptionId={DESCRIPTION_ID}
          status={googleConfig.data}
          checking={googleConfig.isFetching}
          onCheckAgain={checkAgain}
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
