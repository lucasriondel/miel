/**
 * The homepage's section navigation, styled as the app's sidebar — a pill row
 * per entry, the same shape as the app's "All messages".
 *
 * Plain in-page anchors: the page is one prerendered document with no
 * JavaScript, so there is no active-state tracking and no scroll spy. The
 * browser's own `:target` handles the jump. It sticks beside the content on a
 * wide viewport and collapses to a scrollable row of pills on a phone, which is
 * why it is a list rather than a column of divs.
 *
 * "What is Miel" leads, ahead of the guide sections, because it is the question
 * a reader arrives with; it is one entry rather than five because its parts are
 * subsections of it. One entry per answer, not one per heading.
 */
import { GUIDE_SECTIONS } from "../content/guide";
import { ABOUT } from "../content/site";
import { BeeMark } from "./BeeMark";

const MENU: readonly { id: string; navLabel: string }[] = [
  { id: ABOUT.id, navLabel: ABOUT.navLabel },
  ...GUIDE_SECTIONS.map((section) => ({ id: section.id, navLabel: section.navLabel })),
];

export function SideMenu() {
  return (
    <nav className="side-menu" aria-label="Sections">
      <p className="side-menu-brand">
        <BeeMark />
      </p>
      <ul className="side-menu-list">
        {MENU.map((entry) => (
          <li key={entry.id}>
            <a className="side-menu-link" href={`#${entry.id}`}>
              {entry.navLabel}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
