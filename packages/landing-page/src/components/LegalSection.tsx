import type { LegalSection as Section } from "../content/legal";

/**
 * One numbered-in-spirit clause of a legal page: a named section, its prose,
 * and — where the content is an enumeration, such as what is stored — a real
 * list rather than a paragraph of commas.
 */
export function LegalSection({ section }: { section: Section }) {
  return (
    <section aria-labelledby={`${section.id}-heading`} id={section.id}>
      <h2 id={`${section.id}-heading`}>{section.heading}</h2>
      {section.body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {section.bullets ? (
        <ul className="prose-list">
          {section.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
