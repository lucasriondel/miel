import { CONTACT_EMAIL, GITHUB_URL, SITE_NAME } from "../content/site";
import { HOME_PATH, otherPages } from "../content/nav";

/**
 * The site's only navigation. Plain anchors, not router links: each page is a
 * separate prerendered document that has to work with no JavaScript at all.
 * The current page is left out of the list rather than linking to itself.
 */
export function SiteFooter({ current = HOME_PATH }: { current?: string }) {
  return (
    <footer className="site-footer">
      <nav aria-label="Site">
        <ul className="site-nav">
          {otherPages(current).map((entry) => (
            <li key={entry.path}>
              <a href={entry.path}>{entry.label}</a>
            </li>
          ))}
          <li>
            <a href={GITHUB_URL}>Source on GitHub</a>
          </li>
        </ul>
      </nav>
      <p>
        {SITE_NAME} is open source and self-hosted.{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </footer>
  );
}
