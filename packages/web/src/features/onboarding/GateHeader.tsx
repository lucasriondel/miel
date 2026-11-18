import { assetUrl } from "../../lib/basePath";
import type { OnboardingStep } from "./onboardingStep";
import { StepProgress } from "./StepProgress";

/** The top of every step: the honey mark, then where in the four steps this is. */
export const GateHeader = ({ step }: { step: OnboardingStep }) => (
  <div className="flex w-full flex-col items-center gap-4">
    <img
      src={assetUrl("/miel.webp")}
      alt=""
      className="h-14 w-14 rounded-2xl bg-[#f4b63a] object-cover shadow-[0_2px_6px_rgb(20_32_46/0.12)]"
    />
    <StepProgress current={step} />
  </div>
);
