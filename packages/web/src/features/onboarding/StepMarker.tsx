import { Check } from "lucide-react";

interface Props {
  number: number;
  state: "done" | "current" | "upcoming";
}

/** One step's 20px marker: a tick once behind, the number in ink when current. */
export const StepMarker = ({ number, state }: Props) => (
  <span
    aria-hidden
    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
      state === "done"
        ? "bg-gousse-primary/15 text-gousse-ink"
        : state === "current"
          ? "bg-gousse-primary text-gousse-on-primary"
          : "bg-gousse-line text-gousse-muted"
    }`}
  >
    {state === "done" ? <Check className="h-3 w-3" strokeWidth={2.5} /> : number}
  </span>
);
