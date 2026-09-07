import { ICONS, type IconName, type IconShape } from "../content/icons";

/**
 * One Lucide glyph, drawn inline.
 *
 * Inline `<svg>` rather than an `<img>` or a CSS background, because the
 * build's self-containment scan reports every `<img>` and the stylesheet is
 * asserted to carry no `url(` — an inline element fetches nothing by
 * construction, and it inherits `currentColor`, so the glyph is tinted by the
 * card that holds it instead of shipping a second copy per colour scheme.
 *
 * Decorative: each glyph repeats the feature name written beside it, so it is
 * hidden from assistive technology rather than given a label nobody needs to
 * hear twice.
 */
export function FeatureIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="feature-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name].map((shape) => (
        <Shape key={shapeKey(shape)} shape={shape} />
      ))}
    </svg>
  );
}

/**
 * Lucide's own shapes carry a `key` field; these do not, so the key is derived
 * from the geometry — which is unique within a glyph, since two identical
 * shapes at identical coordinates would draw one.
 */
function shapeKey(shape: IconShape): string {
  switch (shape.kind) {
    case "path":
      return shape.d;
    case "rect":
      return `rect:${shape.x},${shape.y},${shape.width},${shape.height}`;
    case "circle":
      return `circle:${shape.cx},${shape.cy},${shape.r}`;
  }
}

/** A filled dot is Lucide's way of marking a hole or a pip; the rest are strokes. */
function Shape({ shape }: { shape: IconShape }) {
  switch (shape.kind) {
    case "path":
      return <path d={shape.d} {...(shape.filled ? { fill: "currentColor" } : {})} />;
    case "rect":
      return (
        <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />
      );
    case "circle":
      return (
        <circle
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          {...(shape.filled ? { fill: "currentColor" } : {})}
        />
      );
  }
}
