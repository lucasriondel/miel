import { Steps } from "@/components/ui/steps";
import type { OnboardingStep } from "./onboardingStep";

const STEPS: readonly { id: OnboardingStep; label: string }[] = [
  { id: "google-config", label: "Configure Google" },
  { id: "connect", label: "Connect a mailbox" },
  { id: "ai", label: "Set up AI triage" },
];

interface Props {
  current: OnboardingStep;
}

/**
 * Where the user is in the gate's three steps.
 *
 * The gate has no back or skip, so this is not navigation — it is the answer to
 * "how much of this is left", which is the question a blocking dialog with no
 * exit provokes. Hence a list with the current item marked rather than buttons.
 *
 * The list itself is gousse-ui's `Steps`, which derives what is done from the
 * ordered steps and the current id. What stays here is the only part that is
 * miel's: which three steps the gate has, keyed by `OnboardingStep` so the ids
 * are the gate's own type rather than loose strings.
 */
export const StepProgress = ({ current }: Props) => <Steps steps={STEPS} current={current} />;
