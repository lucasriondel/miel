/**
 * One guide section: heading, prose, and — where the section has them — the
 * numbered steps, each with an optional command block.
 *
 * The heading carries the section's own id so the side menu's `#motivation`
 * lands on the heading rather than above it, and `scroll-margin-top` in the
 * stylesheet keeps it clear of the sticky header.
 *
 * When a section's steps carry a `variant` (installation's Docker vs. Bun
 * paths), the list renders both sets of variant steps plus a pair of radio
 * inputs styled as tabs. There is no JavaScript in this build, so the
 * show/hide is pure CSS: the radios' `:checked` state selects which
 * `.step-docker`/`.step-bun` elements are visible (see styles.ts). The
 * Docker radio is marked `defaultChecked` so Docker is the default tab.
 */
import type { GuideSection } from "../content/guide";
import { GuideStepView } from "./GuideStepView";

export function GuideSectionView({ section }: { section: GuideSection }) {
  const hasVariants = (section.steps ?? []).some((step) => step.variant);

  return (
    <section aria-labelledby={`${section.id}-heading`} id={section.id}>
      <h2 id={`${section.id}-heading`}>{section.heading}</h2>
      {section.body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {section.steps ? (
        <div className={hasVariants ? "steps-tabs" : undefined}>
          {hasVariants ? (
            <>
              <input
                type="radio"
                name={`${section.id}-variant`}
                id={`${section.id}-tab-docker`}
                className="tab-input tab-input-docker"
                defaultChecked
              />
              <input
                type="radio"
                name={`${section.id}-variant`}
                id={`${section.id}-tab-bun`}
                className="tab-input tab-input-bun"
              />
              <div className="tabs" role="tablist">
                <label className="tab-label tab-label-docker" htmlFor={`${section.id}-tab-docker`}>
                  With Docker
                </label>
                <label className="tab-label tab-label-bun" htmlFor={`${section.id}-tab-bun`}>
                  Without Docker
                </label>
              </div>
            </>
          ) : null}
          <ol className="steps">
            {section.steps.map((step) => (
              <GuideStepView key={`${step.label}-${step.variant ?? "shared"}`} step={step} />
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
