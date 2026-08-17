import { HOME } from "../content/site";
import { AppPreview } from "./AppPreview";
import { CallToAction } from "./CallToAction";

/**
 * Headline, intro and the call to action on the left, the app screenshot beside
 * them on the right. The two are separate children of a grid rather than the
 * shot being floated inside the prose: a real float would let the last
 * paragraph wrap under the image, which reads as an accident at this size.
 *
 * The wrapper keeps the text a column of its own so it stops at reading width
 * instead of stretching to the grid track.
 */
export function Hero() {
  return (
    <div className="hero">
      <div className="hero-copy">
        <h1>{HOME.tagline}</h1>
        {HOME.intro.map((paragraph) => (
          <p className="lede" key={paragraph}>
            {paragraph}
          </p>
        ))}
        <CallToAction />
      </div>
      <AppPreview />
    </div>
  );
}
