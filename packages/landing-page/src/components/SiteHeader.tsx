import { SITE_NAME } from "../content/site";
import { HOME_PATH } from "../content/nav";
import { BeeMark } from "./BeeMark";

/**
 * The wordmark links home on every page except the homepage itself, so a reader
 * who landed on the privacy policy from a search result has a way back.
 *
 * The bee is the app's icon, drawn inline; it sits beside the name rather than
 * replacing it, so the mark is decorative and the accessible name stays text.
 */
export function SiteHeader({ current = HOME_PATH }: { current?: string }) {
  const mark = (
    <>
      <BeeMark />
      <span>{SITE_NAME}</span>
    </>
  );

  return (
    <header className="site-header">
      <p className="wordmark">
        {current === HOME_PATH ? (
          mark
        ) : (
          <a className="wordmark-link" href={HOME_PATH}>
            {mark}
          </a>
        )}
      </p>
    </header>
  );
}
