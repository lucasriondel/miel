import { ONBOARDING_STEPS, type OnboardingStep } from "./onboardingStep";
import { StepMarker } from "./StepMarker";

const LABELS: Record<OnboardingStep, string> = {
  server: "Server",
  "google-config": "Google",
  connect: "Mailbox",
  ai: "AI triage",
};

interface Props {
  current: OnboardingStep;
}

/**
 * Where the user is in the gate's four steps: Server · Google · Mailbox · AI
 * triage, a numbered marker each, a tick on the ones behind.
 *
 * The gate has no back or skip, so this is not navigation — it is the answer to
 * "how much of this is left", which is the question a blocking dialog with no
 * exit provokes. Hence a list with the current item marked rather than buttons.
 *
 * Drawn here rather than through the registry's `Steps`: the redesign's row is
 * one line of small markers under the logo, which that component does not draw.
 */
export const StepProgress = ({ current }: Props) => {
  const at = ONBOARDING_STEPS.indexOf(current);
  return (
    <ol aria-label="Setup progress" className="flex flex-wrap items-center justify-center gap-3">
      {ONBOARDING_STEPS.map((id, index) => {
        const state = index < at ? "done" : index === at ? "current" : "upcoming";
        return (
          <li
            key={id}
            aria-current={state === "current" ? "step" : undefined}
            className={`flex items-center gap-1.5 text-xs font-semibold ${
              state === "current" ? "text-gousse-ink" : "text-gousse-muted"
            }`}
          >
            <StepMarker number={index + 1} state={state} />
            {LABELS[id]}
            {state === "done" ? <span className="sr-only"> (done)</span> : null}
          </li>
        );
      })}
    </ol>
  );
};
