/**
 * One prose block inside "What is Miel".
 *
 * A nested `<section>` with an `<h3>`, not an `<h2>`: these are parts of the
 * answer `AboutSection` heads, so the heading level has to say so — a screen
 * reader's heading outline is the only structure a reader gets on a page with
 * no JavaScript. It keeps its own `id`, so a deep link still lands on it.
 */
import type { Section } from "../content/site";

export function HomeSection({ section }: { section: Section }) {
  return (
    <section aria-labelledby={`${section.id}-heading`} className="subsection" id={section.id}>
      <h3 id={`${section.id}-heading`}>{section.heading}</h3>
      {section.body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </section>
  );
}
