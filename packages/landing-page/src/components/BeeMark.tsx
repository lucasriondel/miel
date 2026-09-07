/**
 * The app icon — the real `packages/web/public/miel.webp`, carried in the
 * document as a `data:` URI (see `content/assets.ts`).
 *
 * Rendered as a background image rather than an `<img>`. The build's
 * self-containment scan reports *every* `<img>` tag, data URI or not, while a
 * `url(data:...)` is explicitly exempt — it is inline by definition, so the
 * browser fetches nothing. The URI sits in a style attribute rather than in
 * `styles.ts` because that stylesheet is asserted to contain no `url(` at all.
 *
 * Decorative wherever a text wordmark sits beside it, so it is hidden from
 * assistive technology rather than described.
 */
import { APP_ICON } from "../content/assets";

export function BeeMark({ className = "bee-mark" }: { className?: string }) {
  return (
    <span
      className={className}
      role="presentation"
      aria-hidden="true"
      style={{ backgroundImage: `url(${APP_ICON})` }}
    />
  );
}
