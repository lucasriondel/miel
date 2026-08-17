import type { ComponentProps, ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/gousse/utils";

/**
 * The step indicator at the top of a wizard — a horizontal `<ol>` of numbered
 * markers, one filled for the step you are on, checked for the ones behind it,
 * hollow for the ones ahead.
 *
 * Progress is a *derived* thing here: pass the ordered `steps` and the `current`
 * id, and the component works out what is done. Callers that track a step index
 * rather than an id can pass the index as `current` instead — both are accepted,
 * so a flow whose steps are unnamed doesn't have to invent ids for them.
 *
 * A step that is neither reached nor current is styled as *upcoming*, not
 * disabled: the flow will get there, so it reads quiet rather than dead.
 */

export interface Step {
  id: string;
  label: ReactNode;
}

interface StepsProps extends Omit<ComponentProps<"ol">, "children"> {
  steps: readonly Step[];
  /** The active step — its `id`, or its zero-based index. */
  current: string | number;
  /**
   * Hide the labels and keep only the markers. For a narrow shell where three
   * labels would wrap; the `aria-label` on each marker keeps the flow readable
   * to assistive tech either way.
   */
  labels?: boolean;
}

const MARKER_BASE =
  "flex size-5 flex-none items-center justify-center rounded-full text-[11px] transition-colors duration-200";

export function Steps({ steps, current, labels = true, className, ...props }: StepsProps) {
  const at =
    typeof current === "number" ? current : steps.findIndex((step) => step.id === current);

  return (
    <ol
      className={cn(
        "flex w-full items-center justify-center gap-3 text-xs font-semibold",
        className,
      )}
      {...props}
    >
      {steps.map((step, index) => {
        const done = index < at;
        const here = index === at;

        return (
          <li
            key={step.id}
            aria-current={here ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5",
              here ? "text-gousse-ink" : "text-gousse-muted",
            )}
          >
            <span
              className={cn(
                MARKER_BASE,
                here
                  ? "bg-gousse-accent text-white"
                  : done
                    ? "bg-gousse-accent/15 text-gousse-accent"
                    : "bg-gousse-line/60 text-gousse-muted",
              )}
              // The number is decorative once a check replaces it, but the step's
              // position is still information — so it is spelled out here rather
              // than left to the glyph.
              aria-label={`Step ${index + 1}${done ? ", done" : ""}`}
            >
              {done ? <Check size={12} aria-hidden /> : index + 1}
            </span>
            {labels ? step.label : null}
          </li>
        );
      })}
    </ol>
  );
}
