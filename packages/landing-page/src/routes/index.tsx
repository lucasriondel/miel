import { createFileRoute } from "@tanstack/react-router";
import { AboutSection } from "../components/AboutSection";
import { ClaudeDisclosureSection } from "../components/ClaudeDisclosureSection";
import { ContactSection } from "../components/ContactSection";
import { GuideSectionView } from "../components/GuideSectionView";
import { PermissionsSection } from "../components/PermissionsSection";
import { Hero } from "../components/Hero";
import { SideMenu } from "../components/SideMenu";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { GUIDE_SECTIONS } from "../content/guide";

export const Route = createFileRoute("/")({
  component: HomePage,
});

/**
 * The hero runs the full width above the two-column split, because the app
 * replica needs the room; everything below it sits beside the side menu.
 */
function HomePage() {
  return (
    <div className="page page-wide">
      <SiteHeader />
      <Hero />
      <div className="layout">
        <SideMenu />
        <main>
          <AboutSection />
          {GUIDE_SECTIONS.map((section) => (
            <GuideSectionView key={section.id} section={section} />
          ))}
          <PermissionsSection />
          <ClaudeDisclosureSection />
          <ContactSection />
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
