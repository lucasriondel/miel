/**
 * A single installation or contribution step.
 *
 * The command block is a `<pre>` rather than prose so a reader can select it
 * cleanly, and it scrolls inside its own box: a long `git clone` line must not
 * push the page sideways on a phone.
 *
 * A step whose work is a sequence in someone else's console carries `substeps`
 * instead of a command (#138). They are a real nested `<ol>`, numbered by the
 * browser: the outer list numbers itself with a counter, so the two sequences
 * stay visually distinct and a reader can be told to redo "step 5" of either.
 */
import type { GuideStep } from "../content/guide";

export function GuideStepView({ step }: { step: GuideStep }) {
  const className = step.variant ? `step step-${step.variant}` : "step";
  return (
    <li className={className}>
      <p className="step-label">{step.label}</p>
      {step.body ? <p className="step-body">{step.body}</p> : null}
      {step.substeps ? (
        <ol className="substeps">
          {step.substeps.map((substep) => (
            <li key={substep}>{substep}</li>
          ))}
        </ol>
      ) : null}
      {step.code ? (
        <pre className="code">
          <code>{step.code}</code>
        </pre>
      ) : null}
    </li>
  );
}
