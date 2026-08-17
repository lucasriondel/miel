/**
 * The inbox screenshot the root README opens with — the real
 * `docs/miel-light.webp` and `docs/miel-dark.webp`, carried in the document as
 * `data:` URIs (see `content/assets.ts`).
 *
 * Two elements rather than one, because the URI has to live in a style
 * attribute — `styles.ts` is asserted to contain no `url(` — and a style
 * attribute cannot be switched by a media query. So both schemes are rendered
 * and the stylesheet shows one, exactly as the README's `<picture>` does with
 * its `prefers-color-scheme` source.
 *
 * Not an `<img>`: the build's self-containment scan reports every `<img>` tag
 * whether or not its `src` is a data URI, while `url(data:...)` is exempt.
 * `aria-hidden` because everything the screenshot shows is stated in the copy
 * around it, and a background image carries no alt text to a screen reader.
 */
import { SCREENSHOT_DARK, SCREENSHOT_LIGHT } from "../content/assets";

export function AppPreview() {
  return (
    <div className="shot" aria-hidden="true">
      <span
        className="shot-image shot-light"
        style={{ backgroundImage: `url(${SCREENSHOT_LIGHT})` }}
      />
      <span
        className="shot-image shot-dark"
        style={{ backgroundImage: `url(${SCREENSHOT_DARK})` }}
      />
    </div>
  );
}
