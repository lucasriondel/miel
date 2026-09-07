/**
 * "What is Miel" — the container the feature grid and the prose blocks sit in.
 *
 * One `<section>` with one `<h2>`, so the side menu has a single anchor for the
 * whole answer; its parts are `<h3>`s inside it rather than sections of their
 * own. That is the difference from the guide sections below it, which are each
 * their own `<section>` because each is a separate question.
 *
 * The feature grid comes first because it answers "what does it do", which is
 * what a reader scrolling off the hero is asking; the prose that follows
 * answers "should I run it".
 */
import { ABOUT, HOME } from "../content/site";
import { FeatureSection } from "./FeatureSection";
import { HomeSection } from "./HomeSection";

export function AboutSection() {
  return (
    <section aria-labelledby={`${ABOUT.id}-heading`} id={ABOUT.id}>
      <h2 id={`${ABOUT.id}-heading`}>{ABOUT.heading}</h2>
      <FeatureSection />
      {HOME.sections.map((section) => (
        <HomeSection key={section.id} section={section} />
      ))}
    </section>
  );
}
