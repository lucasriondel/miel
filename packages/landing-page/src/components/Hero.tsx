import { HOME } from "../content/site";
import { AppPreview } from "./AppPreview";
import { CallToAction } from "./CallToAction";

/**
 * The app screenshot first, at the full width of the page, with the headline,
 * intro and call to action stacked under it. The shot is the one thing on the
 * page that says what miel *is*, so it is given the whole column and read
 * before the words rather than beside them at half the size.
 *
 * The copy keeps a wrapper of its own so it stops at reading width instead of
 * stretching to the full track under the image.
 */
export function Hero() {
  return (
    <div className="hero">
      <AppPreview />
      <div className="hero-copy">
        <h1>{HOME.tagline}</h1>
        {HOME.intro.map((paragraph) => (
          <p className="lede" key={paragraph}>
            {paragraph}
          </p>
        ))}
        <CallToAction />
      </div>
    </div>
  );
}
