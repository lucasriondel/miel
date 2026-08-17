/**
 * The homepage's section navigation, styled as the app's sidebar — a pill row
 * per entry, the same shape as the app's "All messages".
 *
 * Plain in-page anchors: the page is one prerendered document with no
 * JavaScript, so there is no active-state tracking and no scroll spy. The
 * browser's own `:target` handles the jump. It sticks beside the content on a
 * wide viewport and collapses to a scrollable row of pills on a phone, which is
 * why it is a list rather than a column of divs.
 */
import { GUIDE_SECTIONS } from "../content/guide";
import { BeeMark } from "./BeeMark";

export function SideMenu() {
  return (
    <nav className="side-menu" aria-label="Sections">
      <p className="side-menu-brand">
        <BeeMark />
      </p>
      <ul className="side-menu-list">
        {GUIDE_SECTIONS.map((section) => (
          <li key={section.id}>
            <a className="side-menu-link" href={`#${section.id}`}>
              {section.navLabel}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
