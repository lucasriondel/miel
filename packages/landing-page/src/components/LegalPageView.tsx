import type { LegalPage } from "../content/legal";
import { ContactSection } from "./ContactSection";
import { LegalSection } from "./LegalSection";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** The shared frame for the privacy policy and the terms of service. */
export function LegalPageView({ page }: { page: LegalPage }) {
  return (
    <div className="page">
      <SiteHeader current={page.path} />
      <main>
        <h1>{page.heading}</h1>
        {page.intro.map((paragraph) => (
          <p className="lede" key={paragraph}>
            {paragraph}
          </p>
        ))}
        <p className="updated">Last updated {page.lastUpdated}</p>
        {page.sections.map((section) => (
          <LegalSection key={section.id} section={section} />
        ))}
        <ContactSection heading={page.contactHeading} intro={page.contactIntro} />
      </main>
      <SiteFooter current={page.path} />
    </div>
  );
}
