import { CONTACT_EMAIL, HOME } from "../content/site";

/**
 * The closing section on every page. Defaults to the homepage's wording; the
 * legal pages pass their own, because "questions about Miel" and "a deletion
 * request" are not the same invitation.
 */
export function ContactSection({
  heading = HOME.contactHeading,
  intro = HOME.contactIntro,
}: {
  heading?: string;
  intro?: string;
}) {
  return (
    <section aria-labelledby="contact-heading" id="contact">
      <h2 id="contact-heading">{heading}</h2>
      <p>
        {intro} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </section>
  );
}
