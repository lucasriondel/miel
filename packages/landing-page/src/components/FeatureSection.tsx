import { FEATURES } from "../content/site";
import { FeatureIcon } from "./FeatureIcon";

/**
 * The feature list — the first subsection of "What is Miel", so an `<h3>` under
 * that section's heading rather than an `<h2>` beside it.
 *
 * A description list rather than a grid of divs: every entry is a name and the
 * explanation of that name, which is what `<dl>` means — so a screen reader
 * announces the pairing, and with CSS off the page still reads as a list of
 * features rather than fourteen loose paragraphs. The rows are laid out by the
 * stylesheet on top of that, not instead of it.
 *
 * Presented as ruled rows rather than cards, which is the same shape the
 * markup already had: a name in one column, its description in the next. That
 * is also what makes the list indifferent to how many features there are — an
 * eighth is another row, where a two-column grid of cards left the seventh
 * alone on a row of its own and stretched every short card to match its tallest
 * neighbour.
 *
 * The glyph is a sibling of the pair rather than a child of the `<dt>`, because
 * it is the row's first column: nested inside the name it could not line up
 * with the description below it on a narrow screen.
 */
export function FeatureSection() {
  return (
    <section aria-labelledby={`${FEATURES.id}-heading`} className="subsection" id={FEATURES.id}>
      <h3 id={`${FEATURES.id}-heading`}>{FEATURES.heading}</h3>
      <p>{FEATURES.intro}</p>
      <dl className="feature-list">
        {FEATURES.items.map((feature) => (
          <div className="feature" key={feature.name}>
            <FeatureIcon name={feature.icon} />
            <dt>{feature.name}</dt>
            <dd>{feature.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
