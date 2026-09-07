/**
 * The Lucide glyphs the feature list uses, as raw path data.
 *
 * Transcribed from `lucide-react` rather than imported from it, for the reason
 * everything else on this page is inlined: the package must build from its own
 * manifest, and this one ships no JavaScript at all — a React icon component
 * would put a runtime dependency in a document that has no runtime. The web app
 * imports the same names from the real package (`components/systemLabels.ts`),
 * which is where an icon that has to *do* something belongs.
 *
 * The seven below are `__iconNode` from lucide-react 1.16.0, copied verbatim:
 * layout-grid, users-round, gauge, tags, ticket-percent, key-round, pen-line.
 * Lucide is ISC-licensed (see `LUCIDE_LICENSE`), which permits this provided
 * the notice travels with the copy — `icons.test.ts` is what keeps it here.
 *
 * Each entry is the *inside* of a 24x24 `<svg>`; the frame, the stroke and the
 * sizing are `FeatureIcon`'s, so the shapes carry no presentation of their own
 * and every glyph is drawn identically.
 */

/** The one shape a glyph is made of — a `<path>`, `<rect>` or `<circle>`. */
export type IconShape =
  | { kind: "path"; d: string; filled?: boolean }
  | { kind: "rect"; x: string; y: string; width: string; height: string; rx: string }
  | { kind: "circle"; cx: string; cy: string; r: string; filled?: boolean };

export type IconName =
  | "layout-grid"
  | "users-round"
  | "gauge"
  | "tags"
  | "ticket-percent"
  | "key-round"
  | "pen-line";

/**
 * Lucide's copyright notice, reproduced because the ISC licence requires it to
 * accompany copies of the work. It is rendered in the page footer.
 */
export const LUCIDE_LICENSE =
  "Icons by Lucide — ISC License — Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.";

export const ICONS: Record<IconName, readonly IconShape[]> = {
  "layout-grid": [
    { kind: "rect", width: "7", height: "7", x: "3", y: "3", rx: "1" },
    { kind: "rect", width: "7", height: "7", x: "14", y: "3", rx: "1" },
    { kind: "rect", width: "7", height: "7", x: "14", y: "14", rx: "1" },
    { kind: "rect", width: "7", height: "7", x: "3", y: "14", rx: "1" },
  ],
  "users-round": [
    { kind: "path", d: "M18 21a8 8 0 0 0-16 0" },
    { kind: "circle", cx: "10", cy: "8", r: "5" },
    { kind: "path", d: "M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" },
  ],
  gauge: [
    { kind: "path", d: "m12 14 4-4" },
    { kind: "path", d: "M3.34 19a10 10 0 1 1 17.32 0" },
  ],
  tags: [
    {
      kind: "path",
      d: "M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1z",
    },
    {
      kind: "path",
      d: "M2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193",
    },
    { kind: "circle", cx: "10.5", cy: "6.5", r: ".5", filled: true },
  ],
  "ticket-percent": [
    {
      kind: "path",
      d: "M2 9a3 3 0 1 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 1 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z",
    },
    { kind: "path", d: "M9 9h.01" },
    { kind: "path", d: "m15 9-6 6" },
    { kind: "path", d: "M15 15h.01" },
  ],
  "key-round": [
    {
      kind: "path",
      d: "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",
    },
    { kind: "circle", cx: "16.5", cy: "7.5", r: ".5", filled: true },
  ],
  "pen-line": [
    { kind: "path", d: "M13 21h8" },
    {
      kind: "path",
      d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
    },
  ],
};
