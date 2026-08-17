/**
 * Shape of the two legal pages — privacy policy and terms of service.
 *
 * Their copy lives as plain data for the same reason the homepage's does: a
 * unit test asserts the facts the pages must state, and the prerendered-output
 * test asserts the very same strings against the built HTML, so a page that
 * stopped rendering its own text would fail rather than quietly go blank.
 */
import { CONTACT_EMAIL } from "./site";

export type LegalSection = {
  /** Anchor id, also the React key and the `aria-labelledby` target. */
  id: string;
  heading: string;
  body: string[];
  /** Rendered as a real list after the body, when the content is an enumeration. */
  bullets?: string[];
};

export type LegalPage = {
  /** The route this page is prerendered at. */
  path: string;
  /** How the page is named in the footer navigation. */
  navLabel: string;
  /** `<title>`, and the page's meta description's subject. */
  title: string;
  description: string;
  heading: string;
  /** When this text was last written. Prose, because it is read, not parsed. */
  lastUpdated: string;
  intro: string[];
  sections: LegalSection[];
  /** The closing section, rendered with the address as a `mailto:` link. */
  contactHeading: string;
  contactIntro: string;
};

/**
 * The date both pages carry. One constant, because the two were written
 * together and a reader comparing them should not have to wonder why the dates
 * differ.
 */
export const LEGAL_LAST_UPDATED = "10 August 2026";

/** Every string on a legal page, joined — the seam the copy tests assert on. */
export function allLegalText(page: LegalPage): string {
  return [
    page.title,
    page.heading,
    page.lastUpdated,
    ...page.intro,
    ...page.sections.flatMap((section) => [
      section.heading,
      ...section.body,
      ...(section.bullets ?? []),
    ]),
    page.contactHeading,
    page.contactIntro,
    CONTACT_EMAIL,
  ].join("\n");
}
