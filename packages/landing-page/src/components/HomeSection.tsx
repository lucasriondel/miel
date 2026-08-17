import type { Section } from "../content/site";

export function HomeSection({ section }: { section: Section }) {
  return (
    <section aria-labelledby={`${section.id}-heading`} id={section.id}>
      <h2 id={`${section.id}-heading`}>{section.heading}</h2>
      {section.body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </section>
  );
}
